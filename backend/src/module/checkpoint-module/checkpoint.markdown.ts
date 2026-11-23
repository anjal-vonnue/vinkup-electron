import type {
  CheckpointMarkdownPreview,
  CheckpointQuestionType,
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
 * `## Q1` and `### Question 1` are also accepted. No metadata means a text
 * question worth one mark; the manager can still edit the paper and re-upload.
 */

type Metadata = Record<string, string>;

const QUESTION_HEADING = /^#{2,4}\s*(?:question|q)\s*(\d+)\s*[.:)\-–—]?\s*(.*?)\s*$/i;
const MARK_IN_TITLE = /[([]\s*(\d+)\s*marks?\s*[\])]\s*[:\-–—]?\s*/i;
const META_LINE =
  /^(type|marks?|points?|language|lang|choices?|options?|correct|answer|file)\s*[:=]\s*(.*)$/i;
const BRACKET_META = /^\[([^\]]+)\]$/;
const HTML_META = /^<!--([\s\S]*?)-->$/;

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

function buildQuestion(
  title: string,
  bodyLines: string[],
  orderIndex: number,
  warnings: string[]
): ParsedCheckpointQuestion {
  const { metadata, start } = readLeadingMetadata(bodyLines);
  const promptMarkdown = bodyLines.slice(start).join('\n').trim();

  const choices = metadata.choices ? parseChoices(metadata.choices) : [];
  const type = inferType(metadata, choices.length > 0);

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
