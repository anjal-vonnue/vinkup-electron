import { describe, expect, it } from 'vitest';

// Every source file as text (test files left out).
const sources = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('useIdleTracking scope', () => {
  it('is only used by the task workspace (the code editor page)', () => {
    const users = Object.entries(sources)
      .filter(
        ([path, text]) => !path.endsWith('/useIdleTracking.ts') && /useIdleTracking\(/.test(text)
      )
      .map(([path]) => path);

    // TaskWorkspace is only rendered by TaskPage (/tasks/:taskId). Idle time must never be
    // tracked on Home, Day, Journal, Typing test, Resources, Profile, Help or mentor pages.
    expect(users).toEqual(['../components/TaskWorkspace/TaskWorkspace.tsx']);
  });
});
