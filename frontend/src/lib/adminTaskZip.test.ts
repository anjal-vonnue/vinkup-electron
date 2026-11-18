import { describe, expect, it } from 'vitest';
import { createTasksZip, safeZipName } from './adminTaskZip';

describe('safeZipName', () => {
  it('removes path separators, invalid filename characters, and trailing dots', () => {
    expect(safeZipName('../Unsafe/Name?. ')).toBe('.-Unsafe-Name');
  });

  it('returns a fallback for a blank name', () => {
    expect(safeZipName('...')).toBe('unnamed');
  });
});

describe('createTasksZip', () => {
  it('creates a ZIP archive containing task paths and UTF-8 file content', async () => {
    const blob = createTasksZip([
      {
        path: 'HTML/Day 1/Profile',
        files: [{ path: 'src/index.html', content: '<h1>Hi 👋</h1>' }],
        instructionsMarkdown: 'Build a profile page.',
        sequenceOrder: 1,
        title: 'Profile',
      },
    ]);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const archiveText = new TextDecoder().decode(bytes);

    expect(blob.type).toBe('application/zip');
    expect(new DataView(bytes.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(archiveText).toContain('HTML/Day 1/Profile/src/index.html');
    expect(archiveText).toContain('<h1>Hi 👋</h1>');
    expect(archiveText).toContain('HTML/Day 1/Profile/INSTRUCTIONS.md');
    expect(archiveText).toContain('Build a profile page.');
  });

  it('creates the instruction file even when a task has no code files', async () => {
    const blob = createTasksZip([
      {
        path: 'HTML/Day 1/Empty',
        files: [],
        instructionsMarkdown: 'Instructions',
        sequenceOrder: 1,
        title: 'Empty',
      },
    ]);

    expect(new TextDecoder().decode(await blob.arrayBuffer())).toContain(
      'HTML/Day 1/Empty/INSTRUCTIONS.md'
    );
  });
});
