import { createContext } from 'react';
import type { RealtimeEvent } from '@itp/types';

export type RealtimeListener = (event: RealtimeEvent) => void;

export type RealtimeContextValue = {
  /** Adds a listener for every event the server pushes. Returns the unsubscribe function. */
  subscribe: (listener: RealtimeListener) => () => void;
  /**
   * Increments each time the stream reconnects (after the first connection).
   * Proxies close a long-lived stream every ~30s, so pages re-read their data then
   * to catch anything that arrived during the gap.
   */
  epoch: number;
};

/** null outside the provider, so pages can be rendered in tests without one. */
export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
