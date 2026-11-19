import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { LoopbackError, startLoopbackListener } from './loopback';

function rawRequest(port: number, path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, headers: { host } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
  });
}

describe('startLoopbackListener', () => {
  it('binds an ephemeral 127.0.0.1 port and resolves the callback once', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 2_000 });
    try {
      const port = Number(new URL(listener.redirectUri).port);
      expect(new URL(listener.redirectUri).hostname).toBe('127.0.0.1');
      expect(port).toBeGreaterThan(0);

      const pending = listener.waitForCallback();
      const response = await fetch(`${listener.redirectUri}?code=handoff&state=state-1`);
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('data-auth-result="success"');
      expect(html).toContain('Sign-in complete');
      expect(html).toContain('Return to the Vinkup desktop app');
      expect(html).toContain('VinkUp');
      expect(html).not.toContain('Sign-in could not be completed');
      // The one-time handoff code must never be rendered into the browser page.
      expect(html).not.toContain('handoff');

      await expect(pending).resolves.toEqual({ code: 'handoff', state: 'state-1' });
    } finally {
      await listener.close();
    }
  });

  it('serves a distinct failure result page for an OAuth error callback', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 2_000 });
    try {
      const response = await fetch(
        `${listener.redirectUri}?error=DESKTOP_AUTH_CANCELLED&state=state-1`
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('data-auth-result="failure"');
      expect(html).toContain('Sign-in could not be completed');
      expect(html).toContain('Return to Vinkup and try again');
      expect(html).toContain('VinkUp');
      expect(html).not.toContain('Sign-in complete');
      expect(html).not.toContain('DESKTOP_AUTH_CANCELLED');

      await expect(listener.waitForCallback()).resolves.toEqual({
        error: 'DESKTOP_AUTH_CANCELLED',
        state: 'state-1',
      });
    } finally {
      await listener.close();
    }
  });

  it('resolves a callback that arrives before waitForCallback', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 2_000 });
    try {
      await fetch(`${listener.redirectUri}?error=DESKTOP_AUTH_CANCELLED&state=state-1`);
      await expect(listener.waitForCallback()).resolves.toEqual({
        error: 'DESKTOP_AUTH_CANCELLED',
        state: 'state-1',
      });
    } finally {
      await listener.close();
    }
  });

  it('rejects a wrong Host header without settling the flow', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 2_000 });
    try {
      const pending = listener.waitForCallback();
      const port = Number(new URL(listener.redirectUri).port);

      await expect(rawRequest(port, '/callback?code=stolen', 'evil.example')).resolves.toBe(400);

      await fetch(`${listener.redirectUri}?code=real&state=state-1`);
      await expect(pending).resolves.toEqual({ code: 'real', state: 'state-1' });
    } finally {
      await listener.close();
    }
  });

  it('ignores other paths and shows the generic failure page without echoing input', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 2_000 });
    try {
      const port = Number(new URL(listener.redirectUri).port);
      await expect(rawRequest(port, '/favicon.ico', `127.0.0.1:${port}`)).resolves.toBe(404);

      const invalid = await fetch(`http://127.0.0.1:${port}/unknown?token=super-secret`);
      expect(invalid.status).toBe(404);
      const html = await invalid.text();
      expect(html).toContain('data-auth-result="failure"');
      expect(html).toContain('Sign-in could not be completed');
      expect(html).not.toContain('super-secret');

      const pending = listener.waitForCallback();
      await fetch(`${listener.redirectUri}?code=real&state=state-1`);
      await expect(pending).resolves.toEqual({ code: 'real', state: 'state-1' });
    } finally {
      await listener.close();
    }
  });

  it('times out after the configured window', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 30 });
    try {
      await expect(listener.waitForCallback()).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    } finally {
      await listener.close();
    }
  });

  it('rejects a pending wait when closed and is idempotent', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 2_000 });
    const pending = listener.waitForCallback();
    await listener.close();
    await expect(pending).rejects.toBeInstanceOf(LoopbackError);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(listener.close()).resolves.toBeUndefined();
  });

  it('rejects a request without a code or error', async () => {
    const listener = await startLoopbackListener({ timeoutMs: 200 });
    try {
      const pending = listener.waitForCallback();
      const response = await fetch(`${listener.redirectUri}?state=state-1`);
      expect(response.status).toBe(400);
      await expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    } finally {
      await listener.close();
    }
  });
});
