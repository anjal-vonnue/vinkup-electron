import { describe, expect, it } from 'vitest';
import { toTaskFiles } from './task.files.js';

describe('toTaskFiles', () => {
  it('keeps { path, content } string pairs in order', () => {
    const files = [
      { path: 'index.html', content: '<h1>Hi</h1>' },
      { path: 'css/style.css', content: '' },
    ];
    expect(toTaskFiles(files)).toEqual(files);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(toTaskFiles(null)).toEqual([]);
    expect(toTaskFiles({ path: 'a', content: 'b' })).toEqual([]);
    expect(toTaskFiles('[]')).toEqual([]);
  });

  it('drops items that are not string pairs, and extra fields', () => {
    expect(
      toTaskFiles([
        { path: 'ok.js', content: 'x', extra: true },
        { path: 'no-content.js' },
        { path: 1, content: 'x' },
        null,
        'index.html',
      ])
    ).toEqual([{ path: 'ok.js', content: 'x' }]);
  });
});
