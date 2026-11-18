import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import type { WorkspaceConsoleLevel } from '@itp/types';
import { BRIDGE_EVENT_PATH, BRIDGE_PATH, BRIDGE_SCRIPT, BUNDLE_PATH, EVENTS_PATH } from './bridge';
import {
  buildErrorScript,
  bundleModule,
  formatIssue,
  resolveWorkspacePath,
  transformClassicScript,
} from './bundler';
import { readWorkspaceFiles } from './files';
import { isSafeRelativePath, mimeTypeFor, resolveInsideRoot } from './paths';

export type WorkspaceConsoleEvent =
  | { type: 'console'; runId: string; level: WorkspaceConsoleLevel; args: string[]; ts: number }
  | { type: 'console-clear'; runId: string }
  | { type: 'preview-ready'; runId: string; url: string };

export type WorkspaceServerCallbacks = {
  onEvent: (event: WorkspaceConsoleEvent) => void;
};

export type WorkspaceStaticServer = {
  url: string;
  port: number;
  /** Tells connected pages to reload (SSE). */
  notifyReload: () => void;
  close: () => Promise<void>;
};

const MAX_BRIDGE_BODY_BYTES = 1_000_000;
const CLASSIC_SCRIPT_TYPES = new Set(['', 'text/javascript', 'application/javascript']);
const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** HTML escaping of </script inside generated inline JavaScript. */
function escapeScript(code: string): string {
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

function attribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(
    attributes
  );
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function replaceAttribute(attributes: string, name: string, value: string): string {
  return attributes.replace(
    new RegExp(`\\b${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, 'i'),
    `${name}="${value}"`
  );
}

/** Injects the bridge immediately after <head>, or at the top of <body> when there is no head. */
export function injectBridgeAssets(html: string, bridgePath: string = BRIDGE_PATH): string {
  const tag = `<script src="${bridgePath}"></script>`;
  const head = /<head\b[^>]*>/i;
  if (head.test(html)) return html.replace(head, (match) => `${match}\n    ${tag}`);

  const body = /<body\b[^>]*>/i;
  if (body.test(html)) return html.replace(body, (match) => `${match}\n    ${tag}`);

  return `${tag}\n${html}`;
}

/**
 * Module scripts are bundled (they may import .ts files); classic .ts scripts are
 * type-stripped. Plain HTML, CSS and .js are served as they are — the browser already
 * knows how to load relative files from the HTTP server.
 */
export async function rewriteScripts(
  html: string,
  files: Record<string, string>,
  entryPath: string
): Promise<string> {
  const matches = Array.from(html.matchAll(SCRIPT_TAG));
  if (matches.length === 0) return html;

  // Rebuild by position instead of String.replace: bundled code may contain `$&`
  // patterns, and two identical tags must each be rewritten.
  const pieces: string[] = [];
  let cursor = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    pieces.push(html.slice(cursor, start));
    cursor = start + match[0].length;

    const attributes = match[1] ?? '';
    const body = match[2] ?? '';
    const type = (attribute(attributes, 'type') ?? '').trim().toLowerCase();
    const src = attribute(attributes, 'src');
    const isModule = type === 'module';
    const isClassic = CLASSIC_SCRIPT_TYPES.has(type);

    if (!isModule && !isClassic) {
      pieces.push(match[0]);
      continue;
    }

    let nextAttributes = attributes;
    let nextBody = body;
    let extraStyle = '';

    if (src !== null && src.trim() !== '') {
      const resolved = resolveWorkspacePath(entryPath, src);
      if (resolved === null || !(resolved in files)) {
        pieces.push(match[0]);
        continue;
      }

      const extension = path.extname(resolved).toLowerCase();
      if (isModule || extension === '.ts') {
        const mode = isModule ? 'module' : 'classic';
        const url = `${BUNDLE_PATH}?entry=${encodeURIComponent(resolved)}&mode=${mode}`;
        nextAttributes = replaceAttribute(attributes, 'src', url);
        nextAttributes = nextAttributes
          .replace(/\s(?:integrity|crossorigin)="[^"]*"/gi, '')
          .replace(/\s(?:integrity|crossorigin)='[^']*'/gi, '');
      }
    } else if (isModule) {
      const result = await bundleModule(files, { inlineCode: body, htmlPath: entryPath });
      if (result.ok) {
        nextBody = escapeScript(result.js);
        if (result.css) {
          extraStyle = `<style data-source="${entryPath} (inline module)">${result.css}</style>`;
        }
      } else {
        nextBody = escapeScript(buildErrorScript(result.issues));
      }
    }

    pieces.push(`${extraStyle}<script${nextAttributes}>${nextBody}</script>`);
  }

  pieces.push(html.slice(cursor));
  return pieces.join('');
}

async function renderHtml(root: string, entryPath: string, html: string): Promise<string> {
  const files = await readWorkspaceFiles(root);
  return injectBridgeAssets(await rewriteScripts(html, files, entryPath));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(message);
}

function setNoStore(res: http.ServerResponse): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  // The preview is embedded by the app from a different origin.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // The sandboxed iframe has an opaque origin, so its module scripts and fetch() calls
  // are cross-origin even against this server. Task files are public to the page.
  res.setHeader('Access-Control-Allow-Origin', '*');
}

async function sendHtml(
  res: http.ServerResponse,
  root: string,
  entryPath: string,
  html: string
): Promise<void> {
  const body = await renderHtml(root, entryPath, html);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(body);
}

async function sendFile(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  root: string,
  relativePath: string
): Promise<void> {
  const target = resolveInsideRoot(root, relativePath);
  const info = await stat(target);
  if (!info.isFile()) throw new Error('not a file');

  if (path.extname(relativePath).toLowerCase() === '.html') {
    const html = await readFile(target, 'utf8');
    await sendHtml(res, root, relativePath, html);
    return;
  }

  res.writeHead(200, {
    'Content-Type': mimeTypeFor(target),
    'Content-Length': info.size,
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(target);
    stream.on('error', reject);
    stream.on('end', resolve);
    stream.pipe(res);
  });
}

function parseBridgeEvent(value: unknown): WorkspaceConsoleEvent | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const runId = typeof record.runId === 'string' ? record.runId : '';

  if (record.type === 'console-clear') return { type: 'console-clear', runId };
  if (record.type === 'preview-ready') return { type: 'preview-ready', runId, url: '' };

  if (record.type === 'console') {
    const level = record.level;
    const args = record.args;
    const ts = record.ts;
    if (
      (level === 'log' || level === 'info' || level === 'warn' || level === 'error') &&
      Array.isArray(args) &&
      args.every((arg) => typeof arg === 'string')
    ) {
      return {
        type: 'console',
        runId,
        level,
        args: args.slice(0, 50),
        ts: typeof ts === 'number' && Number.isFinite(ts) ? ts : Date.now(),
      };
    }
  }

  return null;
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BRIDGE_BODY_BYTES) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function serveBundle(
  res: http.ServerResponse,
  root: string,
  entry: string,
  mode: string
): Promise<void> {
  if (!isSafeRelativePath(entry)) return sendError(res, 400, 'Bad request');

  let js: string;
  try {
    const files = await readWorkspaceFiles(root);
    if (!(entry in files)) return sendError(res, 404, 'Entry not found');

    if (mode === 'classic') {
      const result = await transformClassicScript(files[entry], entry);
      js = result.ok ? `${result.js}\n//# sourceURL=${entry}` : buildErrorScript(result.issues);
    } else {
      const result = await bundleModule(files, { path: entry });
      // A module that imports CSS gets it injected, so the page does not need a <link>.
      js = result.ok
        ? `${result.css ? inlineStyleScript(result.css) : ''}${result.js}`
        : buildErrorScript(result.issues);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    js = buildErrorScript([{ file: entry, line: null, column: null, message }]);
  }

  res.writeHead(200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(js);
}

function inlineStyleScript(css: string): string {
  return `(function(){var style=document.createElement('style');style.textContent=${JSON.stringify(css)};(document.head||document.documentElement).appendChild(style);})();\n`;
}

export function startWorkspaceServer(options: {
  root: string;
  callbacks: WorkspaceServerCallbacks;
}): Promise<WorkspaceStaticServer> {
  const { root, callbacks } = options;
  const eventClients = new Set<http.ServerResponse>();

  const server = http.createServer((req, res) => {
    void handleRequest(req, res).catch((error: unknown) => {
      if (!res.headersSent) {
        sendError(res, 500, error instanceof Error ? error.message : 'Server error');
      } else {
        res.end();
      }
    });
  });

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const requestUrl = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (requestUrl.pathname === BRIDGE_EVENT_PATH) {
      if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed');
      try {
        const event = parseBridgeEvent(JSON.parse(await readBody(req)));
        if (event) {
          if (event.type === 'preview-ready') {
            const address = server.address();
            const url =
              address && typeof address === 'object'
                ? `http://127.0.0.1:${address.port}${requestUrl.searchParams.get('page') ?? '/'}`
                : '';
            callbacks.onEvent({
              type: 'preview-ready',
              runId: event.runId,
              url,
            });
          } else {
            callbacks.onEvent(event);
          }
        }
      } catch {
        // Malformed bridge output is ignored; console messages are untrusted input.
      }
      res.writeHead(204, {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendError(res, 405, 'Method not allowed');
    }

    setNoStore(res);

    if (requestUrl.pathname === BRIDGE_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : BRIDGE_SCRIPT);
      return;
    }

    if (requestUrl.pathname === EVENTS_PATH) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write(': connected\n\n');
      eventClients.add(res);
      req.on('close', () => eventClients.delete(res));
      return;
    }

    if (requestUrl.pathname === BUNDLE_PATH) {
      await serveBundle(
        res,
        root,
        requestUrl.searchParams.get('entry') ?? '',
        requestUrl.searchParams.get('mode') ?? 'module'
      );
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      return sendError(res, 400, 'Bad request');
    }

    const relativePath = pathname.replace(/^\/+/, '');
    if (relativePath === '') {
      await serveIndex(res, req);
      return;
    }

    if (!isSafeRelativePath(relativePath)) {
      return sendError(res, 403, 'Forbidden');
    }

    let target: string;
    try {
      target = resolveInsideRoot(root, relativePath);
    } catch {
      return sendError(res, 403, 'Forbidden');
    }

    let info;
    try {
      info = await stat(target);
    } catch {
      // Browsers ask for /favicon.ico on their own. A 404 here is logged by Chrome as a
      // console error, which Lighthouse counts against the learner's Best Practices score.
      if (relativePath === 'favicon.ico') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      return sendError(res, 404, 'Not found');
    }

    if (info.isDirectory()) {
      const indexPath = relativePath.replace(/\/+$/, '');
      const nested = `${indexPath}/index.html`;
      try {
        await stat(resolveInsideRoot(root, nested));
      } catch {
        return sendError(res, 404, 'Not found');
      }
      await sendFile(req, res, root, nested);
      return;
    }

    if (!info.isFile()) return sendError(res, 404, 'Not found');
    await sendFile(req, res, root, relativePath);
  }

  async function serveIndex(res: http.ServerResponse, req: http.IncomingMessage): Promise<void> {
    try {
      await sendFile(req, res, root, 'index.html');
    } catch {
      sendError(res, 404, 'No index.html in this workspace');
    }
  }

  return new Promise<WorkspaceStaticServer>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once('error', onError);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not read the workspace server port.'));
        return;
      }

      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        notifyReload() {
          for (const client of eventClients) {
            client.write('event: reload\ndata: {}\n\n');
          }
        },
        close() {
          for (const client of eventClients) client.end();
          eventClients.clear();
          return new Promise<void>((resolveClose) => {
            server.closeAllConnections();
            server.close(() => resolveClose());
          });
        },
      });
    });
  });
}

/** Used by tests: the console text for a build issue, with file and line. */
export function formatBundleIssue(issue: {
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
}): string {
  return formatIssue(issue);
}
