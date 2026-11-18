import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startOverlayServer, type OverlayServer } from './overlayServer';

describe('display overlay server', () => {
  let root: string | null = null;
  let server: OverlayServer | null = null;

  afterEach(async () => {
    await server?.close();
    server = null;
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
  });

  it('serves overlay assets with an HTTP origin and iframe referrer policy', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'vinkup-overlay-'));
    await writeFile(path.join(root, 'overlay.html'), '<!doctype html><title>Overlay</title>');
    server = await startOverlayServer(root);

    const response = await fetch(`${server.url}/overlay.html`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('content-security-policy')).toContain('frame-src');
    expect(await response.text()).toContain('<title>Overlay</title>');
  });

  it('rejects unsupported methods and missing files', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'vinkup-overlay-'));
    server = await startOverlayServer(root);

    const methodResponse = await fetch(`${server.url}/overlay.html`, { method: 'POST' });
    const missingResponse = await fetch(`${server.url}/missing.js`);

    expect(methodResponse.status).toBe(405);
    expect(missingResponse.status).toBe(404);
  });
});
