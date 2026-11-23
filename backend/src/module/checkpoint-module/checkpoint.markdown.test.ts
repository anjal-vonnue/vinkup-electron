import { describe, expect, it } from 'vitest';
import { parseCheckpointMarkdown } from './checkpoint.markdown';

const PAPER = `# JavaScript checkpoint

Read every question carefully. You have 45 minutes.

## Question 1: Explain closures

Describe a closure in your own words.
Write at least three sentences.

## Question 2: Write a function
<!-- type: code, marks: 5, language: javascript -->

Write a function that returns the sum of two numbers.

## Question 3: Choose the SQL clause
Type: multiple_choice
Marks: 2
Choices: WHERE | ORDER BY | GROUP BY
Correct: B

Which clause sorts the result?

## Question 4: Deliver the file
Marks: 3

Upload the requested report.
`;

describe('parseCheckpointMarkdown', () => {
  it('extracts the title, instructions and all questions', () => {
    const parsed = parseCheckpointMarkdown(PAPER);

    expect(parsed.suggestedTitle).toBe('JavaScript checkpoint');
    expect(parsed.instructionsMarkdown).toContain('Read every question carefully');
    expect(parsed.questions).toHaveLength(4);
    expect(parsed.totalQuestionMarks).toBe(11);
  });

  it('reads metadata from comments, plain lines and heading marks', () => {
    const parsed = parseCheckpointMarkdown(`${PAPER}
## Question 5 (10 marks): Bonus
`);

    expect(parsed.questions[1]).toMatchObject({
      type: 'CODE',
      marks: 5,
      codeLanguage: 'javascript',
    });
    expect(parsed.questions[2]).toMatchObject({
      type: 'MULTIPLE_CHOICE',
      marks: 2,
      options: ['WHERE', 'ORDER BY', 'GROUP BY'],
      correctOption: 'ORDER BY',
    });
    expect(parsed.questions[3].type).toBe('TEXT');
    expect(parsed.questions[4]).toMatchObject({ marks: 10, title: 'Bonus' });
  });

  it('defaults to a one-mark text question and warns when no questions exist', () => {
    const parsed = parseCheckpointMarkdown('Only instructions, no questions.');

    expect(parsed.questions).toHaveLength(0);
    expect(parsed.warnings[0]).toContain('No questions were found');
  });

  it('normalizes CRLF line endings', () => {
    const parsed = parseCheckpointMarkdown('## Q1: First\r\n\r\nAnswer here\r\n');
    expect(parsed.questions[0]).toMatchObject({ orderIndex: 1, title: 'First' });
  });

  it('extracts practical runtime, starter files and setup SQL', () => {
    const parsed = parseCheckpointMarkdown(`# Practical checkpoint

## Question 1: Build the page
Type: practical
Marks: 10
Runtime: node
Run: npm test

Create a page that greets the visitor.

\`\`\`html file=index.html
<h1>Hello</h1>
\`\`\`

\`\`\`css file=styles.css
h1 { color: teal; }
\`\`\`

## Question 2: Design the schema
Type: practical
Marks: 5
Runtime: sql

\`\`\`sql setup
create table people (id serial primary key, name text not null);
\`\`\`

Write the missing indexes.
`);

    expect(parsed.questions[0]).toMatchObject({
      type: 'PRACTICAL',
      runtime: 'node',
      runCommand: 'npm test',
      marks: 10,
      starterFiles: [
        { path: 'index.html', content: '<h1>Hello</h1>' },
        { path: 'styles.css', content: 'h1 { color: teal; }' },
      ],
    });
    expect(parsed.questions[0].promptMarkdown).toContain('Create a page');
    expect(parsed.questions[0].promptMarkdown).not.toContain('<h1>Hello</h1>');
    expect(parsed.questions[1]).toMatchObject({
      type: 'PRACTICAL',
      runtime: 'sql',
      setupSql: 'create table people (id serial primary key, name text not null);',
      starterFiles: null,
    });
    expect(parsed.questions[1].promptMarkdown).not.toContain('create table');
  });

  it('warns about unsafe starter file paths instead of storing them', () => {
    const parsed = parseCheckpointMarkdown(`## Q1: Unsafe
Type: practical

\`\`\`text file=../escape.txt
bad
\`\`\`
`);

    expect(parsed.questions[0].starterFiles).toBeNull();
    expect(parsed.questions[0].promptMarkdown).toContain('../escape.txt');
    expect(parsed.warnings.join(' ')).toContain('not a valid starter file path');
  });
});
