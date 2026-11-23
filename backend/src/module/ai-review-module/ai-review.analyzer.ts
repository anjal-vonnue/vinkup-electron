import { z } from 'zod';
import type { AiTaskResult } from '@itp/types';
import { buildPrompt, SYSTEM_PROMPT } from './ai-review.prompt';
import type { Loaded, Submission } from './ai-review.submissions';
import { generateWithFallback, maxInputBudget } from './providers';

const MAX_TASKS_PER_CALL = 8;

const tokens = (text: string) => Math.ceil(text.length / 4);

const itemSchema = z.object({
  taskId: z.string(),
  recommendation: z.enum(['approve', 'rework']),
  reasoning: z.string().transform((s) => s.trim().slice(0, 600)),
  feedback: z.string().transform((s) => s.trim().slice(0, 1500)),
  evidence: z
    .array(z.string())
    .default([])
    .transform((items) => items.slice(0, 3).map((s) => s.slice(0, 200))),
});

const outputSchema = z.object({ results: z.array(z.unknown()) });

function parseOutput(text: string): unknown[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON object in model output');
  return outputSchema.parse(JSON.parse(text.slice(start, end + 1))).results;
}

const fail = (taskId: string, error: string): AiTaskResult => ({ taskId, status: 'error', error });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : 'Analysis failed.');

function packBatches(submissions: Submission[], rubric: string): Submission[][] {
  const budget = maxInputBudget();
  const overhead = tokens(SYSTEM_PROMPT) + tokens(rubric) + 200;
  const batches: Submission[][] = [];
  let current: Submission[] = [];
  let used = overhead;
  for (const submission of submissions) {
    const cost = tokens(submission.instructionsMarkdown) + tokens(submission.code) + 100;
    if (current.length && (current.length >= MAX_TASKS_PER_CALL || used + cost > budget)) {
      batches.push(current);
      current = [];
      used = overhead;
    }
    current.push(submission);
    used += cost;
  }
  if (current.length) batches.push(current);
  return batches;
}

function exceedsInputBudget(submission: Submission[], rubric: string): boolean {
  const budget = maxInputBudget();
  if (budget === 0) return false;
  const prompt = buildPrompt(rubric, submission);
  return tokens(prompt.system) + tokens(prompt.user) > budget;
}

const halve = <T>(items: T[]): T[][] => {
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
};

async function runBatch(
  batch: Submission[],
  rubric: string,
  isRetry = false
): Promise<AiTaskResult[]> {
  const ids = new Set(batch.map((s) => s.taskId));
  const done = new Map<string, AiTaskResult>();

  if (exceedsInputBudget(batch, rubric)) {
    if (!isRetry && batch.length > 1) {
      const results = await Promise.all(halve(batch).map((chunk) => runBatch(chunk, rubric, true)));
      return results.flat();
    }
    return batch.map((s) =>
      fail(
        s.taskId,
        'This task exceeds the configured AI input limit, including its instructions and rubric.'
      )
    );
  }

  try {
    const prompt = buildPrompt(rubric, batch);
    const { value, provider, model } = await generateWithFallback(
      prompt,
      tokens(prompt.system) + tokens(prompt.user),
      parseOutput
    );
    for (const raw of value) {
      const item = itemSchema.safeParse(raw);
      if (!item.success || !ids.has(item.data.taskId) || done.has(item.data.taskId)) continue;
      done.set(item.data.taskId, { status: 'ok', provider, model, ...item.data });
    }
  } catch (error) {
    return batch.map((s) => fail(s.taskId, messageOf(error)));
  }

  const missing = batch.filter((s) => !done.has(s.taskId));
  if (missing.length > 0 && !isRetry) {
    // Retry only what's missing; if the whole batch came back unusable, split it.
    const chunks =
      missing.length === batch.length && missing.length > 1 ? halve(missing) : [missing];
    for (const chunk of chunks) {
      for (const result of await runBatch(chunk, rubric, true)) done.set(result.taskId, result);
    }
  }

  return batch.map(
    (s) =>
      done.get(s.taskId) ?? fail(s.taskId, 'The AI did not return a usable result for this task.')
  );
}

/** Returns one result per input, in the same order. Never throws for per-task problems. */
export async function analyzeSubmissions(
  rubric: string,
  loaded: Loaded[]
): Promise<AiTaskResult[]> {
  const results = new Map<string, AiTaskResult>();
  const submissions: Submission[] = [];
  for (const item of loaded) {
    if ('error' in item) results.set(item.taskId, fail(item.taskId, item.error));
    else submissions.push(item);
  }

  // Sequential on purpose: free-tier rate limits are tight.
  for (const batch of packBatches(submissions, rubric)) {
    for (const result of await runBatch(batch, rubric)) results.set(result.taskId, result);
  }

  return loaded.map((item) => results.get(item.taskId) ?? fail(item.taskId, 'Not analysed.'));
}
