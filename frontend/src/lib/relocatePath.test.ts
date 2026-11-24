import { describe, expect, it } from 'vitest';
import { planRelocation, rewritePath, folderPathError } from './relocatePath';

const paths = ['index.html', 'src/app.js', 'src/ui/nav.js', 'src2/other.js', 'README.md'];

describe('rewritePath', () => {
  it('rewrites a file and everything inside a folder, but not lookalike prefixes', () => {
    expect(rewritePath('index.html', 'index.html', 'home.html')).toBe('home.html');
    expect(rewritePath('src/ui/nav.js', 'src', 'lib')).toBe('lib/ui/nav.js');
    expect(rewritePath('src2/other.js', 'src', 'lib')).toBe('src2/other.js');
  });
});

describe('planRelocation', () => {
  it('renames a file', () => {
    expect(planRelocation(paths, 'index.html', 'home.html')).toMatchObject({
      ok: true,
      kind: 'file',
      to: 'home.html',
    });
  });

  it('allows a case-only rename but blocks a case-insensitive clash', () => {
    expect(planRelocation(paths, 'README.md', 'readme.md').ok).toBe(true);
    expect(planRelocation(paths, 'index.html', 'readme.MD').ok).toBe(false);
  });

  it('rejects bad file names', () => {
    expect(planRelocation(paths, 'index.html', 'bad name.html').ok).toBe(false); // space not allowed
    expect(planRelocation(paths, 'index.html', 'index.').ok).toBe(false); // trailing dot
  });

  it('accepts any extension', () => {
    expect(planRelocation(paths, 'index.html', 'index.exe').ok).toBe(true);
  });

  it('moves a file into a folder', () => {
    expect(planRelocation(paths, 'index.html', 'src/index.html')).toMatchObject({
      ok: true,
      to: 'src/index.html',
    });
  });

  it('renames a folder', () => {
    expect(planRelocation(paths, 'src', 'lib')).toMatchObject({
      ok: true,
      kind: 'folder',
      to: 'lib',
    });
  });

  it('blocks folder collisions, merges and moving a folder into itself', () => {
    expect(planRelocation(paths, 'src', 'src2').ok).toBe(false);
    expect(planRelocation(paths, 'src', 'src/ui').ok).toBe(false);
    expect(planRelocation(paths, 'src/ui', 'index.html').ok).toBe(false);
  });

  it('treats the same name as unchanged and a missing source as an error', () => {
    expect(planRelocation(paths, 'src', 'src')).toMatchObject({ ok: true, unchanged: true });
    expect(planRelocation(paths, 'nope.js', 'x.js').ok).toBe(false);
  });

  it('allows hidden folders but still rejects ignored ones, "." segments and trailing dots', () => {
    expect(folderPathError('.config', [])).toBeNull();
    expect(folderPathError('.git', [])).toBe("Files in that folder aren't saved.");
    expect(folderPathError('a/./b', [])).toBe("That path isn't valid.");
    expect(folderPathError('assets.', [])).toBe('Names cannot end with a dot.');
  });
});
