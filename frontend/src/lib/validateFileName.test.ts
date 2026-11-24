import { describe, it, expect } from 'vitest';
import { validateFileName } from './validateFileName';

describe('validateFileName', () => {
  it('rejects an empty name', () => {
    expect(validateFileName('   ', [])).toEqual({ ok: false, message: 'Enter a file name.' });
  });

  it('rejects a name over 200 characters', () => {
    const longName = `${'a'.repeat(198)}.js`; // 201 chars
    expect(validateFileName(longName, [])).toEqual({
      ok: false,
      message: 'File path must be 200 characters or fewer.',
    });
  });

  it('rejects a disallowed character', () => {
    expect(validateFileName('my file.js', [])).toEqual({
      ok: false,
      message: 'Use only letters, numbers, dots, dashes, underscores and /.',
    });
  });

  it('rejects a path with a leading slash', () => {
    expect(validateFileName('/src/a.js', [])).toEqual({
      ok: false,
      message: "That path isn't valid.",
    });
  });

  it('rejects a path with a double slash', () => {
    expect(validateFileName('src//a.js', [])).toEqual({
      ok: false,
      message: "That path isn't valid.",
    });
  });

  it('rejects a .. segment', () => {
    expect(validateFileName('../a.js', [])).toEqual({
      ok: false,
      message: "That path isn't valid.",
    });
  });

  it('rejects a path inside an ignored folder', () => {
    expect(validateFileName('node_modules/x.js', [])).toEqual({
      ok: false,
      message: "Files in that folder aren't saved.",
    });
  });

  it('rejects a name that already exists (case-insensitive)', () => {
    expect(validateFileName('About.HTML', ['about.html'])).toEqual({
      ok: false,
      message: 'A file or folder with that name already exists.',
    });
  });

  it('rejects using an existing file as a folder', () => {
    expect(validateFileName('styles.css/x.js', ['styles.css'])).toEqual({
      ok: false,
      message: 'A file or folder with that name already exists.',
    });
  });

  it('rejects a name that collides with an existing folder', () => {
    // "assets.js" is an existing folder (it holds logo.svg); the new name has a valid
    // extension of its own, so this reaches the duplicate-name rule, not the extension rule.
    expect(validateFileName('assets.js', ['assets.js/logo.svg'])).toEqual({
      ok: false,
      message: 'A file or folder with that name already exists.',
    });
  });

  it('accepts a simple valid file name', () => {
    expect(validateFileName('about.html', [])).toEqual({ ok: true, path: 'about.html' });
  });

  it('accepts a nested valid file name', () => {
    expect(validateFileName('src/utils/math.ts', [])).toEqual({
      ok: true,
      path: 'src/utils/math.ts',
    });
  });

  it('strips one leading ./', () => {
    expect(validateFileName('./about.html', [])).toEqual({ ok: true, path: 'about.html' });
  });
});

it('accepts any extension, and files with no extension', () => {
  for (const name of ['main.py', 'data.csv', 'archive.tar.gz', 'Makefile', 'LICENSE']) {
    expect(validateFileName(name, [])).toEqual({ ok: true, path: name });
  }
});

it('accepts hidden files and folders', () => {
  for (const name of ['.env', '.gitignore', '.python-version', '.config/app.json']) {
    expect(validateFileName(name, [])).toEqual({ ok: true, path: name });
  }
});

it('rejects a name ending with a dot, and "." path segments', () => {
  expect(validateFileName('notes.', [])).toEqual({
    ok: false,
    message: 'Names cannot end with a dot.',
  });
  expect(validateFileName('a/./b.txt', [])).toEqual({
    ok: false,
    message: "That path isn't valid.",
  });
});
