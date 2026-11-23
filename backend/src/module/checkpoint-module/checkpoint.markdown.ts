import type {
  CheckpointMarkdownPreview,
  CheckpointQuestionRuntime,
  CheckpointQuestionType,
  CheckpointWorkspaceFile,
  ParsedCheckpointQuestion,
} from '@itp/types';

/**
 * Parses an uploaded checkpoint paper.
 *
 * The Markdown file is the single source of the assessment. Instructions are
 * everything before the first question heading. A question starts with:
 *
 *   ## Question 1: Build the query
 *
 * Metadata is optional and may be written as a leading HTML comment, a bracketed
 * line, or plain `key: value` lines immediately under the heading:
 *
 *   <!-- type: sql, marks: 10, language: postgresql -->
 *   [type=code, marks=5, language=typescript]
 *   Type: multiple_choice
 *   Marks: 2
 *   Choices: A | B | C
 *   Correct: B
 *
 * Practical questions run a workspace like a daily task. Their metadata selects a
 * runtime and the fenced blocks with `file=` become starter files:
 *
 *   Type: practical
 *   Runtime: node
 *   Run: npm test
 *
 *   ```javascript file=index.js
 *   console.log('start here');
 *   ```
 *
 *   ```sql setup
 *   create table people (id serial primary key);
 *   ```
 *
 * `## Q1` and `### Question 1` are also accepted. No metadata means a text
 * question worth one mark; the manager can still edit the paper and re-upload.
 */

type Metadata = Record<string, string>;

const QUESTION_HEADING = /^#{2,4}\s*(?:question|q)\s*(\d+)\s*[.:)\-–—]?\s*(.*?)\s*$/i;
const MARK_IN_TITLE = /[([]\s*(\d+)\s*marks?\s*[\])]\s*[:\-–—]?\s*/i;
const META_LINE =
  /^(type|marks?|points?|language|lang|choices?|options?|correct|answer|file|runtime|environment|env|run|run-command|command|setup|setup-sql|sql-setup)\s*[:=]\s*(.*)$/i;
const BRACKET_META = /^\[([^\]]+)\]$/;
const HTML_META = /^<!--([\s\S]*?)-->$/;
const FENCE_OPEN = /^\s*(`{3,}|~{3,})\s*(.*)$/;
const FENCE_CLOSE = /^\s*(`{3,}|~{3,})\s*$/;

const TYPE_ALIASES: Record<string, CheckpointQuestionType> = {
  text: 'TEXT',
  short: 'TEXT',
  string: 'TEXT',
  long: 'LONG_TEXT',
  long_text: 'LONG_TEXT',
  longtext: 'LONG_TEXT',
  essay: 'LONG_TEXT',
  code: 'CODE',
  programming: 'CODE',
  program: 'CODE',
  sql: 'SQL',
  query: 'SQL',
  mcq: 'MULTIPLE_CHOICE',
  multiple_choice: 'MULTIPLE_CHOICE',
  multiplechoice: 'MULTIPLE_CHOICE',
  choice: 'MULTIPLE_CHOICE',
  file: 'FILE',
  upload: 'FILE',
  file_upload: 'FILE',
  practical: 'PRACTICAL',
  workspace: 'PRACTICAL',
  terminal: 'PRACTICAL',
  task: 'PRACTICAL',
  build: 'PRACTICAL',
  coding_task: 'PRACTICAL',
};

const RUNTIME_ALIASES: Record<string, CheckpointQuestionRuntime> = {
  node: 'node',
  nodejs: 'node',
  javascript: 'node',
  js: 'node',
  typescript: 'node',
  ts: 'node',
  browser: 'browser',
  web: 'browser',
  html: 'browser',
  css: 'browser',
  sql: 'sql',
  postgres: 'sql',
  postgresql: 'sql',
  psql: 'sql',
};

function normalizeKey(key: string): string {
  const lower = key.trim().toLowerCase();
  if (lower === 'marks' || lower === 'mark' || lower === 'point' || lower === 'points') {
    return 'marks';
  }
  if (lower === 'language' || lower === 'lang') return 'language';
  if (lower === 'choices' || lower === 'choice' || lower === 'option' || lower === 'options') {
    return 'choices';
  }
  if (lower === 'correct' || lower === 'answer') return 'correct';
  if (lower === 'file' || lower === 'upload') return 'file';
  if (lower === 'runtime' || lower === 'environment' || lower === 'env') return 'runtime';
  if (lower === 'run' || lower === 'run-command' || lower === 'command') return 'runCommand';
  if (lower === 'setup' || lower === 'setup-sql' || lower === 'sql-setup') return 'setupSql';
  return 'type';
}

function parseKeyValueChunk(chunk: string, into: Metadata): void {
  for (const part of chunk.split(/[,;\n]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([^:=]+)\s*[:=]\s*([\s\S]*)$/);
    if (!match) continue;
    into[normalizeKey(match[1])] = match[2].trim();
  }
}

function parseChoices(value: string): string[] {
  const separator = value.includes('|') ? '|' : value.includes(';') ? ';' : ',';
  return value
    .split(separator)
    .map((choice) => choice.trim())
    .filter(Boolean);
}

function inferType(metadata: Metadata, hasChoices: boolean): CheckpointQuestionType {
  const explicit = metadata.type?.toLowerCase().replace(/\s+/g, '_');
  if (explicit && TYPE_ALIASES[explicit]) return TYPE_ALIASES[explicit];

  const language = metadata.language?.toLowerCase();
  if (hasChoices) return 'MULTIPLE_CHOICE';
  if (language === 'sql' || language === 'postgresql' || language === 'psql') return 'SQL';
  if (language) return 'CODE';
  return 'TEXT';
}

function resolveCorrectOption(correct: string | undefined, choices: string[]): string | null {
  if (!correct) return null;
  const trimmed = correct.trim();
  if (choices.length === 0) return trimmed;

  // `Correct: B` selects the second choice. `Correct: <full label>` is kept as is.
  if (/^[A-Za-z]$/.test(trimmed)) {
    const index = trimmed.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < choices.length) return choices[index];
  }
  if (/^\d+$/.test(trimmed)) {
    const index = Number(trimmed) - 1;
    if (index >= 0 && index < choices.length) return choices[index];
  }
  return choices.find((choice) => choice.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}

function readLeadingMetadata(lines: string[]): { metadata: Metadata; start: number } {
  const metadata: Metadata = {};
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    const html = line.match(HTML_META);
    if (html) {
      parseKeyValueChunk(html[1], metadata);
      index += 1;
      continue;
    }

    const bracket = line.match(BRACKET_META);
    if (bracket && /[:=]/.test(bracket[1])) {
      parseKeyValueChunk(bracket[1], metadata);
      index += 1;
      continue;
    }

    const keyValue = line.match(META_LINE);
    if (keyValue) {
      metadata[normalizeKey(keyValue[1])] = keyValue[2].trim();
      index += 1;
      continue;
    }

    break;
  }

  return { metadata, start: index };
}

type FenceBlock = {
  start: number;
  end: number;
  content: string;
  file: string | null;
  setup: boolean;
};

function parseFenceInfo(info: string): Pick<FenceBlock, 'file' | 'setup'> {
  const fileMatch = info.match(/(?:^|\s)(?:file|path|filename)=("[^"]+"|'[^']+'|\S+)/i);
  const file = fileMatch ? fileMatch[1].replace(/^['"]|['"]$/g, '') : null;
  const setup = /(?:^|\s)(?:setup|setup-sql|sql-setup)(?:\s|$)/i.test(info);
  return { file, setup };
}

/** Finds fenced code blocks and their positional range, so starter files can be removed. */
function findFencedBlocks(lines: string[]): FenceBlock[] {
  const blocks: FenceBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const open = lines[index].match(FENCE_OPEN);
    if (!open) {
      index += 1;
      continue;
    }

    const marker = open[1];
    const fenceChar = marker[0];
    const fenceLength = marker.length;
    let end = -1;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const close = lines[cursor].match(FENCE_CLOSE);
      if (!close) continue;
      if (close[1][0] !== fenceChar || close[1].length < fenceLength) continue;
      end = cursor;
      break;
    }

    if (end === -1) {
      index += 1;
      continue;
    }

    blocks.push({
      start: index,
      end,
      content: lines.slice(index + 1, end).join('\n'),
      ...parseFenceInfo(open[2] ?? ''),
    });
    index = end + 1;
  }

  return blocks;
}

function safeWorkspacePath(value: string): string | null {
  const path = value.trim().replace(/^\.\//, '');
  if (!path || path.length > 200) return null;
  if (path.includes('\\') || path.includes('\0')) return null;
  if (path.startsWith('/')) return null;
  if (path.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null;
  }
  return path;
}

function extractWorkspace(
  lines: string[],
  orderIndex: number,
  warnings: string[]
): {
  promptLines: string[];
  starterFiles: CheckpointWorkspaceFile[];
  setupSql: string | null;
} {
  const blocks = findFencedBlocks(lines);
  const starterFiles: CheckpointWorkspaceFile[] = [];
  const removed = new Set<number>();
  let setupSql: string | null = null;

  for (const block of blocks) {
    if (block.file) {
      const path = safeWorkspacePath(block.file);
      if (!path) {
        warnings.push(
          `Question ${orderIndex}: "${block.file}" is not a valid starter file path; the block was kept in the prompt.`
        );
        continue;
      }

      const existingIndex = starterFiles.findIndex((file) => file.path === path);
      if (existingIndex >= 0) {
        warnings.push(
          `Question ${orderIndex}: starter file "${path}" appears more than once; the last block wins.`
        );
        starterFiles[existingIndex] = { path, content: block.content };
      } else {
        starterFiles.push({ path, content: block.content });
      }
      for (let line = block.start; line <= block.end; line += 1) removed.add(line);
    } else if (block.setup) {
      setupSql = block.content.trim();
      for (let line = block.start; line <= block.end; line += 1) removed.add(line);
    }
  }

  return {
    promptLines: lines.filter((_, index) => !removed.has(index)),
    starterFiles,
    setupSql,
  };
}

function resolveRuntime(
  metadata: Metadata,
  type: CheckpointQuestionType,
  orderIndex: number,
  warnings: string[]
): CheckpointQuestionRuntime | null {
  if (type !== 'PRACTICAL') return null;

  const raw = metadata.runtime?.trim().toLowerCase().replace(/\s+/g, '_');
  if (raw) {
    const runtime = RUNTIME_ALIASES[raw];
    if (runtime) return runtime;
    warnings.push(`Question ${orderIndex}: unknown runtime "${metadata.runtime}"; using node.`);
    return 'node';
  }

  if (metadata.setupSql) return 'sql';
  if (metadata.runCommand) return 'node';
  return 'node';
}

function buildQuestion(
  title: string,
  bodyLines: string[],
  orderIndex: number,
  warnings: string[]
): ParsedCheckpointQuestion {
  const { metadata, start } = readLeadingMetadata(bodyLines);

  const choices = metadata.choices ? parseChoices(metadata.choices) : [];
  const type = inferType(metadata, choices.length > 0);

  const promptBody = bodyLines.slice(start);
  let promptLines = promptBody;
  let runtime: CheckpointQuestionRuntime | null = null;
  let starterFiles: CheckpointWorkspaceFile[] | null = null;
  let setupSql = metadata.setupSql?.trim() || null;

  if (type === 'PRACTICAL') {
    const extracted = extractWorkspace(promptBody, orderIndex, warnings);
    promptLines = extracted.promptLines;
    starterFiles = extracted.starterFiles.length > 0 ? extracted.starterFiles : null;
    setupSql = extracted.setupSql ?? setupSql;
    runtime = resolveRuntime(metadata, type, orderIndex, warnings);
  }

  const promptMarkdown = promptLines.join('\n').trim();

  const parsedMarks = Number.parseInt(metadata.marks ?? '', 10);
  const marks = Number.isFinite(parsedMarks) && parsedMarks > 0 ? parsedMarks : 1;
  if (metadata.marks && marks === 1 && metadata.marks !== '1') {
    warnings.push(
      `Question ${orderIndex}: "${metadata.marks}" is not a valid mark value; using 1.`
    );
  }

  const titleMatch = title.match(MARK_IN_TITLE);
  const cleanTitle = (titleMatch ? title.replace(MARK_IN_TITLE, ' ') : title)
    .replace(/\s+/g, ' ')
    .trim();
  const titleMarks = titleMatch ? Number.parseInt(titleMatch[1], 10) : Number.NaN;
  const finalMarks = Number.isFinite(titleMarks) && titleMarks > 0 ? titleMarks : marks;
  if (titleMatch && metadata.marks && Number(metadata.marks) !== titleMarks) {
    warnings.push(
      `Question ${orderIndex}: marks in the heading (${titleMarks}) replace marks in the metadata (${metadata.marks}).`
    );
  }

  const language =
    metadata.language?.trim() || (type === 'SQL' ? 'sql' : type === 'CODE' ? 'javascript' : null);

  return {
    orderIndex,
    title: cleanTitle || `Question ${orderIndex}`,
    promptMarkdown: promptMarkdown || (cleanTitle ? `Answer ${cleanTitle}.` : ''),
    type,
    marks: finalMarks,
    options: type === 'MULTIPLE_CHOICE' && choices.length > 0 ? choices : null,
    correctOption:
      type === 'MULTIPLE_CHOICE' ? resolveCorrectOption(metadata.correct, choices) : null,
    codeLanguage: language,
    runtime,
    runCommand: type === 'PRACTICAL' ? metadata.runCommand?.trim() || null : null,
    setupSql: type === 'PRACTICAL' ? setupSql : null,
    starterFiles: type === 'PRACTICAL' ? starterFiles : null,
  };
}

function stripLeadingTitleHeading(lines: string[]): {
  title: string | null;
  remaining: string[];
} {
  let index = 0;
  while (index < lines.length && !lines[index].trim()) index += 1;

  const first = lines[index]?.trim();
  if (!first || !/^#\s+/.test(first)) return { title: null, remaining: lines };
  if (/^#\s*(?:question|q)\s*\d+/i.test(first)) return { title: null, remaining: lines };

  return {
    title: first.replace(/^#\s+/, '').trim(),
    remaining: [...lines.slice(0, index), ...lines.slice(index + 1)],
  };
}

export function parseCheckpointMarkdown(markdown: string): CheckpointMarkdownPreview {
  const warnings: string[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  const headings: Array<{ index: number; number: number; title: string }> = [];
  lines.forEach((line, index) => {
    const match = line.match(QUESTION_HEADING);
    if (match) {
      headings.push({
        index,
        number: Number.parseInt(match[1], 10),
        title: match[2].trim(),
      });
    }
  });

  const { title: suggestedTitle, remaining: preambleLines } = stripLeadingTitleHeading(
    headings.length > 0 ? lines.slice(0, headings[0].index) : lines
  );
  const instructionsMarkdown = preambleLines.join('\n').trim();

  const questions = headings.map((heading, position) => {
    const end = position + 1 < headings.length ? headings[position + 1].index : lines.length;
    const body = lines.slice(heading.index + 1, end);
    return buildQuestion(heading.title, body, position + 1, warnings);
  });

  if (questions.length === 0) {
    warnings.push(
      'No questions were found. Start each question with a heading such as "## Question 1: Your title".'
    );
  }

  const seenNumbers = new Set<number>();
  for (const heading of headings) {
    if (seenNumbers.has(heading.number)) {
      warnings.push(`Question number ${heading.number} appears more than once.`);
    }
    seenNumbers.add(heading.number);
  }

  return {
    suggestedTitle,
    instructionsMarkdown,
    questions,
    totalQuestionMarks: questions.reduce((total, question) => total + question.marks, 0),
    warnings,
  };
}
