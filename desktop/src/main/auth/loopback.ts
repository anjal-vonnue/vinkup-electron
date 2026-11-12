import http from 'node:http';

export class LoopbackError extends Error {
  constructor(readonly code: 'TIMEOUT' | 'CANCELLED' | 'PORT_UNAVAILABLE') {
    super(code);
    this.name = 'LoopbackError';
  }
}

export interface LoopbackCallback {
  code?: string;
  state?: string;
  error?: string;
}

export interface LoopbackListener {
  redirectUri: string;
  waitForCallback(): Promise<LoopbackCallback>;
  /** Idempotent. Rejects a pending wait with CANCELLED. */
  close(): Promise<void>;
}

const CALLBACK_PATH = '/callback';
const HOST = '127.0.0.1';

const SUCCESS_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Vinkup sign-in</title></head>
<body style="font-family: system-ui, sans-serif; background:#10131f; color:#eef2ff; padding:48px">
<h1 style="font-size:20px">Sign-in complete</h1>
<p>You can close this tab and return to Vinkup.</p>
</body></html>`;

const FAILURE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Vinkup sign-in</title></head>
<body style="font-family: system-ui, sans-serif; background:#10131f; color:#eef2ff; padding:48px">
<h1 style="font-size:20px">Sign-in could not be completed</h1>
<p>Return to Vinkup and try again.</p>
</body></html>`;

function sendHtml(res: http.ServerResponse, status: number, body: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(body);
}

/**
 * Accepts exactly one OAuth redirect on a random loopback port.
 *
 * Binding to 127.0.0.1 and checking the Host header prevents a DNS-rebinding
 * page from racing the real callback. The redirect URL contains a one-time
 * handoff code only; tokens are fetched later by the main process over HTTPS.
 */
export function startLoopbackListener(
  options: { timeoutMs?: number } = {}
): Promise<LoopbackListener> {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  return new Promise<LoopbackListener>((resolve, reject) => {
    let callbackResolve: ((value: LoopbackCallback) => void) | null = null;
    let callbackReject: ((error: Error) => void) | null = null;
    let receivedCallback: LoopbackCallback | null = null;
    let settled = false;
    let closed = false;
    let timeout: NodeJS.Timeout | null = null;

    const server = http.createServer((req, res) => {
      const expectedHost = `127.0.0.1:${(server.address() as { port: number }).port}`;
      if (req.headers.host !== expectedHost) {
        sendHtml(res, 400, FAILURE_HTML);
        return;
      }
      if (req.method !== 'GET') {
        sendHtml(res, 405, FAILURE_HTML);
        return;
      }

      let requestUrl: URL;
      try {
        requestUrl = new URL(req.url ?? '/', `http://${HOST}`);
      } catch {
        sendHtml(res, 400, FAILURE_HTML);
        return;
      }
      if (requestUrl.pathname !== CALLBACK_PATH) {
        sendHtml(res, 404, FAILURE_HTML);
        return;
      }

      const callback: LoopbackCallback = {};
      const code = requestUrl.searchParams.get('code');
      const state = requestUrl.searchParams.get('state');
      const error = requestUrl.searchParams.get('error');
      if (code) callback.code = code;
      if (state) callback.state = state;
      if (error) callback.error = error;

      if (!callback.code && !callback.error) {
        sendHtml(res, 400, FAILURE_HTML);
        return;
      }

      sendHtml(res, 200, callback.error ? FAILURE_HTML : SUCCESS_HTML);

      if (settled) return;
      settled = true;
      receivedCallback = callback;
      if (timeout) clearTimeout(timeout);
      callbackResolve?.(callback);
      callbackResolve = null;
      callbackReject = null;
    });

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (closed) return;
      closed = true;
      reject(
        error.code === 'EADDRINUSE' || error.code === 'EACCES'
          ? new LoopbackError('PORT_UNAVAILABLE')
          : error
      );
    });

    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        closed = true;
        server.close();
        reject(new LoopbackError('PORT_UNAVAILABLE'));
        return;
      }

      const listener: LoopbackListener = {
        redirectUri: `http://${HOST}:${address.port}${CALLBACK_PATH}`,
        waitForCallback: () =>
          new Promise<LoopbackCallback>((resolveCallback, rejectCallback) => {
            if (receivedCallback) {
              resolveCallback(receivedCallback);
              return;
            }
            if (closed) {
              rejectCallback(new LoopbackError('CANCELLED'));
              return;
            }
            if (settled) {
              rejectCallback(new LoopbackError('CANCELLED'));
              return;
            }

            callbackResolve = resolveCallback;
            callbackReject = rejectCallback;
            timeout = setTimeout(() => {
              if (settled) return;
              settled = true;
              callbackResolve = null;
              callbackReject = null;
              rejectCallback(new LoopbackError('TIMEOUT'));
            }, timeoutMs);
            timeout.unref?.();
          }),
        close: () =>
          new Promise<void>((resolveClose) => {
            if (closed) {
              resolveClose();
              return;
            }
            closed = true;
            if (timeout) clearTimeout(timeout);
            if (!settled) {
              settled = true;
              callbackReject?.(new LoopbackError('CANCELLED'));
            }
            callbackResolve = null;
            callbackReject = null;
            server.closeAllConnections();
            server.close(() => resolveClose());
          }),
      };

      resolve(listener);
    });
  });
}
