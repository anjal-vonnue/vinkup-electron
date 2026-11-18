import type { RealtimeEvent } from '@itp/types';

/** One open `GET /api/events` response. */
export type RealtimeClient = {
  write: (chunk: string) => void;
};

/**
 * Keeps the open event streams per user and pushes events to them.
 *
 * In-process only: it reaches connections held by this Node process. Running
 * more than one backend instance would need a shared bus (Redis pub/sub or
 * Postgres LISTEN/NOTIFY) in front of `publish`.
 */
export class RealtimeBroker {
  private readonly clients = new Map<string, Set<RealtimeClient>>();

  /** Registers a stream for a user. The returned function removes it again. */
  subscribe(userId: string, client: RealtimeClient): () => void {
    let connections = this.clients.get(userId);
    if (!connections) {
      connections = new Set();
      this.clients.set(userId, connections);
    }
    connections.add(client);

    return () => {
      const current = this.clients.get(userId);
      if (!current) return;
      current.delete(client);
      if (current.size === 0) this.clients.delete(userId);
    };
  }

  /** Sends one event to every stream the user has open (tabs, reconnects). Never throws. */
  publish(userId: string, event: RealtimeEvent): void {
    const connections = this.clients.get(userId);
    if (!connections || connections.size === 0) return;

    // Default "message" event, so one onmessage handler in the client can switch on `type`.
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of connections) {
      try {
        client.write(frame);
      } catch {
        // The socket closed between the check and the write; req 'close' unsubscribes it.
      }
    }
  }

  /** How many streams a user has open. Used by tests. */
  connectionCount(userId: string): number {
    return this.clients.get(userId)?.size ?? 0;
  }
}

export const realtimeBroker = new RealtimeBroker();
