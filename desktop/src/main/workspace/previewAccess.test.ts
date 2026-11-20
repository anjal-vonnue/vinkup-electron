import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BUNDLED_ALLOWLIST, resolveNavigationInput } from '../resources/allowlist';
import { LocalServicePorts } from '../resources/localPorts';
import { WorkspaceManager } from './manager';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('trusted static preview access', () => {
  it('opens a real HTML preview in the Resources browser only while it runs', async () => {
    const baseDir = await mkdtemp(path.join(os.tmpdir(), 'vinkup-preview-access-'));
    temporaryRoots.push(baseDir);
    const ports = new LocalServicePorts({
      candidates: [],
      probe: () => Promise.resolve(false),
      pollMs: 10,
    });
    const manager = new WorkspaceManager({
      baseDir,
      emitEvent: () => undefined,
      emitTerminalData: () => undefined,
      emitTerminalExit: () => undefined,
      registerStaticPreview: (_taskId, port, isActive) => {
        const registration = ports.registerStaticPreview(port, isActive);
        return () => registration.dispose();
      },
    });

    try {
      const opened = await manager.open({
        taskId: 'html-day-01-t-1',
        files: { 'index.html': '<h1>preview works</h1>' },
      });
      const served = await fetch(opened.previewUrl);
      expect(served.status).toBe(200);
      expect(await served.text()).toContain('preview works');
      expect(
        resolveNavigationInput(opened.previewUrl, BUNDLED_ALLOWLIST, ports.snapshot()).kind
      ).toBe('navigate');
      expect(
        resolveNavigationInput('http://localhost:8080', BUNDLED_ALLOWLIST, ports.snapshot()).kind
      ).toBe('blocked');

      await manager.close('html-day-01-t-1');
      expect(
        resolveNavigationInput(opened.previewUrl, BUNDLED_ALLOWLIST, ports.snapshot()).kind
      ).toBe('blocked');
    } finally {
      await manager.closeAll();
      ports.dispose();
    }
  });
});
