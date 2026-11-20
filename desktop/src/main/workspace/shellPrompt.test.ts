import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareShellLaunch } from './shellPrompt';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vinkup-shell-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('prepareShellLaunch', () => {
  it('starts bash with a generated rc file that keeps only the prompt', async () => {
    const root = await temporaryRoot();
    const launch = await prepareShellLaunch({ shell: '/bin/bash', root });

    const rcFile = path.join(root, '.vinkup', 'shell', 'bashrc');
    expect(launch).toEqual({ args: ['--rcfile', rcFile], env: {} });

    const rc = await readFile(rcFile, 'utf8');
    expect(rc).toContain('. "$HOME/.bashrc"');
    expect(rc).toContain("PS1='\\$ '");
    expect(rc).toContain("PROMPT_COMMAND=''");
  });

  it('points zsh at a generated ZDOTDIR that sources the real config', async () => {
    const root = await temporaryRoot();
    const launch = await prepareShellLaunch({ shell: '/usr/bin/zsh', root });

    const dir = path.join(root, '.vinkup', 'shell');
    expect(launch).toEqual({ args: [], env: { ZDOTDIR: dir } });

    const env = await readFile(path.join(dir, '.zshenv'), 'utf8');
    expect(env).toContain('. "$HOME/.zshenv"');

    const rc = await readFile(path.join(dir, '.zshrc'), 'utf8');
    expect(rc).toContain('. "$HOME/.zshrc"');
    expect(rc).toContain("PROMPT='$ '");
    expect(rc).toContain("RPROMPT=''");
    expect(rc).toContain('PROMPT_COMMAND=()');
  });

  it('leaves an unsupported shell alone', async () => {
    const root = await temporaryRoot();
    const launch = await prepareShellLaunch({ shell: '/usr/bin/fish', root });

    expect(launch).toEqual({ args: [], env: {} });
    await expect(access(path.join(root, '.vinkup'))).rejects.toThrow();
  });

  it('falls back to the normal prompt when the files cannot be written', async () => {
    const root = await temporaryRoot();
    // A file where the shell directory should be makes mkdir fail.
    await writeFile(path.join(root, '.vinkup'), 'not a directory');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const launch = await prepareShellLaunch({ shell: '/bin/bash', root });

    expect(launch).toEqual({ args: [], env: {} });
    expect(warn).toHaveBeenCalledOnce();
  });

  it('refuses to write through a symlink planted in the workspace', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await symlink(outside, path.join(root, '.vinkup'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const launch = await prepareShellLaunch({ shell: '/bin/bash', root });

    expect(launch).toEqual({ args: [], env: {} });
    expect(warn).toHaveBeenCalledOnce();
    await expect(access(path.join(outside, 'shell'))).rejects.toThrow();
  });
});
