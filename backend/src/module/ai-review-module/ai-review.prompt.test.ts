import { describe, expect, it } from 'vitest';
import type { Submission } from './ai-review.submissions';
import { buildPrompt } from './ai-review.prompt';

describe('buildPrompt', () => {
  it('includes task instructions separately from the trainee submission', () => {
    const submission: Submission = {
      taskId: 'task-1',
      title: 'Profile page',
      instructionsMarkdown: 'Create a semantic profile page with a heading.',
      code: '<main><h1>Profile</h1></main>',
    };

    const prompt = buildPrompt('Check semantic HTML.', [submission]);

    expect(prompt.user).toContain(
      '<instructions>\nCreate a semantic profile page with a heading.\n</instructions>'
    );
    expect(prompt.user).toContain('<submission>\n<main><h1>Profile</h1></main>\n</submission>');
    expect(prompt.user).toContain('Mentor rubric:\n<rubric>\nCheck semantic HTML.\n</rubric>');
  });
});
