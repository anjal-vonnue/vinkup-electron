import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

export type OverlayServer = {
  url: string;
  close: () => Promise<void>;
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function sendError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(message);
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function serveFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  root: string
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendError(res, 405, 'Method not allowed');
    return;
  }

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    sendError(res, 400, 'Bad request');
    return;
  }

  const resolvedRoot = path.resolve(root);
  const filePath = path.resolve(resolvedRoot, `.${pathname}`);
  if (filePath === resolvedRoot || !filePath.startsWith(`${resolvedRoot}${path.sep}`)) {
    sendError(res, 403, 'Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      sendError(res, 404, 'Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type':
        MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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
  } catch (error) {
    if (isMissingFileError(error)) {
      sendError(res, 404, 'Not found');
      return;
    }
    throw error;
  }
}

export function startOverlayServer(root: string): Promise<OverlayServer> {
  const server = http.createServer((req, res) => {
    void serveFile(req, res, root).catch((error: unknown) => {
      console.error('[desktop] Failed to serve display overlay asset', error);
      if (!res.headersSent) sendError(res, 500, 'Internal server error');
      else res.destroy();
    });
  });

  return new Promise<OverlayServer>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not determine the display overlay server address.'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            server.closeAllConnections();
            server.close((error) => {
              if (error) rejectClose(error);
              else resolveClose();
            });
          }),
      });
    });
  });
}
