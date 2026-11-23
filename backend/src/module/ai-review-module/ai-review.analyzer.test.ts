import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerMocks = vi.hoisted(() => ({
  generateWithFallback: vi.fn(),
  maxInputBudget: vi.fn(),
}));

vi.mock('./providers', () => providerMocks);

import { analyzeSubmissions } from './ai-review.analyzer';
import { SYSTEM_PROMPT } from './ai-review.prompt';
import type { Submission } from './ai-review.submissions';
import type { GenerateRequest } from './providers/types';

const submission = (taskId: string, instructionsMarkdown: string): Submission => ({
  taskId,
  title: `Task ${taskId}`,
  instructionsMarkdown,
  code: 'const answer = 42;',
});

const tokens = (text: string) => Math.ceil(text.length / 4);

describe('analyzeSubmissions input sizing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMocks.generateWithFallback.mockImplementation((prompt: GenerateRequest) => ({
      value: [...prompt.user.matchAll(/<task id="([^"]+)"/g)].map((match) => ({
        taskId: match[1] ?? '',
        recommendation: 'approve',
        reasoning: 'ok',
        feedback: 'ok',
        evidence: [],
      })),
      provider: 'test',
      model: 'test-model',
    }));
  });

  it('uses instruction length when deciding whether tasks fit in one batch', async () => {
    const rubric = 'Review against requirements.';
    const a = submission('one', 'A'.repeat(800));
    const b = submission('two', 'B'.repeat(800));
    // Each task fits; both together exceed this budget once their full prompt is assembled.
    const singlePromptCost =
      tokens(SYSTEM_PROMPT) +
      tokens(rubric) +
      200 +
      tokens(a.instructionsMarkdown) +
      tokens(a.code) +
      200;
    providerMocks.maxInputBudget.mockReturnValue(singlePromptCost + 100);

    const results = await analyzeSubmissions(rubric, [a, b]);

    expect(results.map((result) => result.status)).toEqual(['ok', 'ok']);
    expect(providerMocks.generateWithFallback).toHaveBeenCalledTimes(2);
  });

  it('returns a task error without calling a provider when one task exceeds the configured input limit', async () => {
    providerMocks.maxInputBudget.mockReturnValue(100);

    const results = await analyzeSubmissions('Rubric', [
      submission('large', 'Do this. '.repeat(1000)),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.taskId).toBe('large');
    expect(results[0]?.status).toBe('error');
    if (results[0]?.status === 'error') {
      expect(results[0].error).toContain('configured AI input limit');
    }
    expect(providerMocks.generateWithFallback).not.toHaveBeenCalled();
  });
});
