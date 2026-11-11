import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import httpProxy from 'http-proxy';
import { getApiUrl, getDesktopPort, getFrontendDir } from './config';

export type LocalServer = {
  url: string;
  close: () => Promise<void>;
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function setIsolationHeaders(res: http.ServerResponse): void {
  // WebContainer needs a cross-origin isolated document. These headers must be
  // on the first page load, not only on task pages.
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function resolveStaticPath(frontendDir: string, pathname: string): string | null {
  const root = path.resolve(frontendDir);
  const resolved = path.resolve(root, `.${pathname}`);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}

async function sendFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  filePath: string
): Promise<void> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error(`Not a file: ${filePath}`);

  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': fileStat.size,
    'Cache-Control': filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(message);
}

async function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  frontendDir: string
): Promise<void> {
  const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

  let pathname: string;
  try {
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch {
    sendError(res, 400, 'Bad request');
    return;
  }

  const filePath = resolveStaticPath(frontendDir, pathname);

  if (!filePath) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      await sendFile(req, res, filePath);
      return;
    }
    if (fileStat.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      const indexStat = await stat(indexPath);
      if (indexStat.isFile()) {
        await sendFile(req, res, indexPath);
        return;
      }
    }
  } catch {
    // Fall through to the SPA fallback / 404 below.
  }

  // React Router owns paths without a file extension. A missing asset is a real 404.
  const isAssetRequest = pathname.startsWith('/assets/') || path.extname(pathname) !== '';
  if (!isAssetRequest) {
    const indexPath = path.join(frontendDir, 'index.html');
    try {
      await sendFile(req, res, indexPath);
      return;
    } catch {
      // Fall through to 404.
    }
  }

  sendError(res, 404, 'Not found');
}

export function startLocalServer(): Promise<LocalServer> {
  const port = getDesktopPort();
  const frontendDir = getFrontendDir();
  const apiUrl = getApiUrl();

  if (!existsSync(frontendDir)) {
    console.warn(
      `[desktop] Frontend build not found at ${frontendDir}. Run "npm run build -w frontend".`
    );
  }

  const proxy = httpProxy.createProxyServer({
    target: apiUrl,
    changeOrigin: true,
    ws: false,
  });

  proxy.on('error', (error, _req, res) => {
    console.error('[desktop] API proxy error', error);
    if ('writeHead' in res && !res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: { code: 'BAD_GATEWAY', message: 'The Vinkup API is unavailable.' },
        })
      );
      return;
    }
    res.end();
  });

  const server = http.createServer((req, res) => {
    const isApiRequest = req.url === '/api' || req.url?.startsWith('/api/') === true;
    if (isApiRequest) {
      proxy.web(req, res);
      return;
    }

    setIsolationHeaders(res);
    void serveStatic(req, res, frontendDir);
  });

  return new Promise<LocalServer>((resolve, reject) => {
    const onStartError = (error: Error): void => {
      reject(error);
    };

    server.once('error', onStartError);
    server.on('error', (error) => {
      console.error('[desktop] Local server error', error);
    });

    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onStartError);
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.closeAllConnections();
            server.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }
              resolveClose();
            });
          }),
      });
    });
  });
}
