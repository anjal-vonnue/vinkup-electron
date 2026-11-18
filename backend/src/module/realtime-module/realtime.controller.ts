import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../types/auth.types';
import { realtimeBroker, type RealtimeClient } from './realtime.broker';

/** Comment frames keep proxies from closing a stream that has nothing to say. */
const HEARTBEAT_MS = 15_000;

class RealtimeController {
  /** GET /api/events — one long-lived `text/event-stream` response per tab. */
  stream = (req: Request, res: Response): void => {
    const user = (req as AuthenticatedRequest).user;

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // `no-transform` stops a proxy from gzipping (and buffering) the stream.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Netlify's proxy closes the connection after ~26s, so reconnect quickly and
    // let the page re-read its data (see `useRealtimeRefresh`).
    res.write('retry: 2000\n\n');

    const client: RealtimeClient = {
      write: (chunk) => {
        if (!res.writableEnded) res.write(chunk);
      },
    };
    const unsubscribe = realtimeBroker.subscribe(user.id, client);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': ping\n\n');
    }, HEARTBEAT_MS);
    // Don't keep the process (or a test run) alive just for the heartbeat.
    heartbeat.unref();

    // The response's 'close' fires when the client goes away (or the proxy drops it).
    res.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  };
}

export const realtimeController = new RealtimeController();
