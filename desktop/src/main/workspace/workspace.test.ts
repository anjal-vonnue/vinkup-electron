import { request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceEvent } from '@itp/types';
import { bundleModule, resolveWorkspacePath } from './bundler';
import { WorkspaceManager } from './manager';
import {
  isIgnoredPath,
  isSafeRelativePath,
  looksBinary,
  MAX_FILE_CHARS,
  resolveInsideRoot,
  shouldWriteFile,
} from './paths';
import { extractServerPort, splitCommand } from './process';
import {
  rewriteScripts,
  startWorkspaceServer,
  type WorkspaceServerCallbacks,
} from './staticServer';

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vinkup-workspace-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('workspace paths', () => {
  it('rejects traversal and absolute paths', () => {
    expect(isSafeRelativePath('src/index.ts')).toBe(true);
    expect(isSafeRelativePath('../secret')).toBe(false);
    expect(isSafeRelativePath('src/../../secret')).toBe(false);
    expect(isSafeRelativePath('/etc/passwd')).toBe(false);
    expect(isSafeRelativePath('src\\file.ts')).toBe(false);
    expect(() => resolveInsideRoot('/tmp/root', '../x')).toThrow();
  });

  it('applies the editor ignore rules and size limits', () => {
    expect(isIgnoredPath('node_modules/x/index.js')).toBe(true);
    expect(isIgnoredPath('.vinkup/prisma.js')).toBe(true);
    expect(isIgnoredPath('package-lock.json')).toBe(true);
    expect(isIgnoredPath('src/app.ts')).toBe(false);
    expect(shouldWriteFile('src/app.ts', 'const x = 1;')).toEqual({ ok: true });
    expect(shouldWriteFile('src/app.ts', 'a'.repeat(MAX_FILE_CHARS + 1))).toEqual({
      ok: false,
      reason: 'too-large',
    });
    expect(looksBinary('a\u0000b')).toBe(true);
  });
});

describe('process helpers', () => {
  it('splits trusted task commands', () => {
    expect(splitCommand('npm run dev')).toEqual({ command: 'npm', args: ['run', 'dev'] });
    expect(splitCommand(`node "my script.js"`)).toEqual({
      command: 'node',
      args: ['my script.js'],
    });
  });

  it('finds the last localhost port a dev server prints', () => {
    expect(extractServerPort('Local: http://localhost:5173/')).toBe(5173);
    expect(extractServerPort('http://127.0.0.1:3000 and http://localhost:8080')).toBe(8080);
    expect(extractServerPort('no server here')).toBeNull();
  });
});

describe('bundler', () => {
  it('resolves workspace-relative imports', () => {
    expect(resolveWorkspacePath('src/app.js', './utils.ts')).toBe('src/utils.ts');
    expect(resolveWorkspacePath('index.html', 'pages/about.html')).toBe('pages/about.html');
    expect(resolveWorkspacePath('index.html', 'https://example.com/a.js')).toBeNull();
  });

  it('bundles a TypeScript module with its relative imports', async () => {
    const files = {
      'app.js': "import { add } from './math.ts';\nconsole.log(add(2, 3));",
      'math.ts': 'export function add(a: number, b: number): number { return a + b; }',
    };
    const result = await bundleModule(files, { path: 'app.js' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.js).toContain('function add');
      expect(result.js).not.toContain(': number');
    }
  });
});

describe('static preview server', () => {
  it('rewrites every script tag without treating $ patterns as replacements', async () => {
    const inline = '<script type="module">console.log("$&");</script>';
    const result = await rewriteScripts(`${inline}${inline}`, {}, 'index.html');
    expect(result.match(/console\.log/g)).toHaveLength(2);
    expect(result.match(/\$&/g)).toHaveLength(2);
  });

  it('serves modules and the bridge to the opaque-origin sandbox', async () => {
    const root = await temporaryRoot();
    await writeFile(
      path.join(root, 'index.html'),
      '<script type="module" src="./app.js"></script>'
    );
    await writeFile(path.join(root, 'app.js'), "console.log('ok')");
    const server = await startWorkspaceServer({ root, callbacks: { onEvent: () => undefined } });

    try {
      const html = await fetch(`${server.url}/index.html`);
      expect(html.headers.get('access-control-allow-origin')).toBe('*');
      const bundle = await fetch(`${server.url}/__vinkup/bundle.js?entry=app.js&mode=module`);
      expect(bundle.headers.get('access-control-allow-origin')).toBe('*');
      const bridge = await (await fetch(`${server.url}/__vinkup/bridge.js`)).text();
      expect(bridge).toContain('text/plain;charset=UTF-8');
      expect(bridge).not.toContain('application/json');
    } finally {
      await server.close();
    }
  });

  it('serves HTML with the bridge and bundles module scripts', async () => {
    const root = await temporaryRoot();
    await writeFile(
      path.join(root, 'index.html'),
      '<!doctype html><html><head></head><body><script type="module" src="./app.js"></script></body></html>'
    );
    await writeFile(
      path.join(root, 'app.js'),
      "import { add } from './math.ts';\nconsole.log(add(1, 2));"
    );
    await writeFile(
      path.join(root, 'math.ts'),
      'export const add = (a: number, b: number) => a + b;'
    );

    const events: Array<{ type: string }> = [];
    const callbacks: WorkspaceServerCallbacks = { onEvent: (event) => events.push(event) };
    const server = await startWorkspaceServer({ root, callbacks });

    try {
      const htmlResponse = await fetch(`${server.url}/index.html`);
      expect(htmlResponse.status).toBe(200);
      const html = await htmlResponse.text();
      expect(html).toContain('/__vinkup/bridge.js');
      expect(html).toContain('/__vinkup/bundle.js?entry=app.js&mode=module');

      const bundleResponse = await fetch(
        `${server.url}/__vinkup/bundle.js?entry=app.js&mode=module`
      );
      const bundle = await bundleResponse.text();
      expect(bundle).toContain('a + b');
      expect(bundle).not.toContain(': number');

      const bridgeResponse = await fetch(`${server.url}/__vinkup/bridge-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'console',
          level: 'log',
          args: ['hi'],
          ts: 1,
          runId: 'run-1',
        }),
      });
      expect(bridgeResponse.status).toBe(204);
      expect(events).toContainEqual({
        type: 'console',
        runId: 'run-1',
        level: 'log',
        args: ['hi'],
        ts: 1,
      });
    } finally {
      await server.close();
    }
  });

  it('rejects path traversal with a raw request', async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, 'index.html'), '<h1>ok</h1>');
    const server = await startWorkspaceServer({ root, callbacks: { onEvent: () => undefined } });

    try {
      const status = await new Promise<number>((resolve, reject) => {
        const request = httpRequest(
          { host: '127.0.0.1', port: server.port, path: '/%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
          (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode ?? 0));
          }
        );
        request.on('error', reject);
        request.end();
      });
      expect(status).toBe(403);
    } finally {
      await server.close();
    }
  });
});

describe('WorkspaceManager', () => {
  it('mirrors files, syncs edits and removes the folder on close', async () => {
    const baseDir = await temporaryRoot();
    const events: WorkspaceEvent[] = [];
    const manager = new WorkspaceManager({
      baseDir,
      emitEvent: (event) => events.push(event),
      emitTerminalData: () => undefined,
      emitTerminalExit: () => undefined,
    });

    const opened = await manager.open({
      taskId: 'task_1',
      files: { 'index.html': '<h1>One</h1>', 'package-lock.json': 'ignored' },
    });

    const root = path.join(baseDir, 'task_1');
    expect(await readFile(path.join(root, 'index.html'), 'utf8')).toBe('<h1>One</h1>');
    await expect(readFile(path.join(root, 'package-lock.json'), 'utf8')).rejects.toThrow();

    await manager.sync('task_1', { 'index.html': '<h1>Two</h1>' });
    expect(await readFile(path.join(root, 'index.html'), 'utf8')).toBe('<h1>Two</h1>');

    await writeFile(path.join(root, 'notes.txt'), 'from the terminal\n');
    await vi.waitFor(
      () =>
        expect(events).toContainEqual({
          type: 'file-changed',
          taskId: 'task_1',
          path: 'notes.txt',
          content: 'from the terminal\n',
        }),
      { timeout: 4_000 }
    );

    expect(opened.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    await manager.close('task_1');
    await expect(readFile(path.join(root, 'index.html'), 'utf8')).rejects.toThrow();
  });

  it('refuses to open the same task twice with a bad id', async () => {
    const baseDir = await temporaryRoot();
    const manager = new WorkspaceManager({
      baseDir,
      emitEvent: () => undefined,
      emitTerminalData: () => undefined,
      emitTerminalExit: () => undefined,
    });
    await expect(manager.open({ taskId: '../escape', files: {} })).rejects.toThrow(
      'Invalid task id'
    );
  });

  it('keeps the Prisma database across reopens but not the old code', async () => {
    const baseDir = await temporaryRoot();
    const manager = new WorkspaceManager({
      baseDir,
      emitEvent: () => undefined,
      emitTerminalData: () => undefined,
      emitTerminalExit: () => undefined,
    });
    const root = path.join(baseDir, 'task_2');

    await manager.open({ taskId: 'task_2', files: { 'index.js': 'old' } });
    await mkdir(path.join(root, '.vinkup', 'db'), { recursive: true });
    await writeFile(path.join(root, '.vinkup', 'db', 'data'), 'rows');
    await manager.close('task_2');

    await manager.open({ taskId: 'task_2', files: { 'index.js': 'new' } });
    expect(await readFile(path.join(root, 'index.js'), 'utf8')).toBe('new');
    expect(await readFile(path.join(root, '.vinkup', 'db', 'data'), 'utf8')).toBe('rows');
    await manager.close('task_2');
  });

  it('writes terminal input to a real shell and streams its output back', async () => {
    const baseDir = await temporaryRoot();
    const output: string[] = [];
    const manager = new WorkspaceManager({
      baseDir,
      emitEvent: () => undefined,
      emitTerminalData: (event) => output.push(event.data),
      emitTerminalExit: () => undefined,
    });
    await manager.open({ taskId: 'task_term', files: { 'index.js': 'console.log(1)' } });

    const { terminalId } = await manager.openTerminal({ taskId: 'task_term', cols: 80, rows: 24 });
    // The shell must evaluate this, so seeing 42 proves the keys reached the PTY.
    await manager.writeTerminal(terminalId, 'echo $((6*7))\r');

    await vi.waitFor(() => expect(output.join('')).toContain('42'), { timeout: 15_000 });

    await manager.closeTerminal(terminalId);
    await manager.close('task_term');
  });
});
