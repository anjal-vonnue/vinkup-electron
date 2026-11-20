import { describe, expect, it } from 'vitest';
import { usesTrustedStaticPreview } from './preview';

describe('usesTrustedStaticPreview', () => {
  it('covers only the app-managed browser courses', () => {
    for (const taskId of ['html-day-01-t-1', 'css-day-02-t-3', 'js-day-04-t-9']) {
      expect(usesTrustedStaticPreview(taskId)).toBe(true);
    }
  });

  it('leaves every other course on its existing preview behavior', () => {
    for (const taskId of [
      'ts-day-01-t-1',
      'react-day-01-t-1',
      'prisma-day-01-t-1',
      'postgresql-day-01-t-1',
      'node-day-01-t-1',
      'task_1',
    ]) {
      expect(usesTrustedStaticPreview(taskId)).toBe(false);
    }
  });
});
