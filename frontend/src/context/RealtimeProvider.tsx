import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { RealtimeEvent } from '@itp/types';
import {
  RealtimeContext,
  type RealtimeContextValue,
  type RealtimeListener,
} from './RealtimeContext';

type RealtimeProviderProps = {
  children: ReactNode;
  /**
   * Opens the stream. Defaults to on, except in mock mode (`VITE_USE_MOCKS`), where
   * there is no backend to stream from. Tests pass `true` together with a fake
   * `EventSource`.
   */
  enabled?: boolean;
};

/**
 * One `GET /api/events` stream for the whole app (per tab).
 *
 * Mount it inside the authenticated routes only: the endpoint is cookie-authenticated,
 * and on the login page the browser would retry a 401 forever. EventSource reconnects
 * on its own; `epoch` tells pages when a reconnect happened so they can re-read data.
 */
export function RealtimeProvider({ children, enabled }: RealtimeProviderProps) {
  const listeners = useRef(new Set<RealtimeListener>());
  const hasConnected = useRef(false);
  const [epoch, setEpoch] = useState(0);

  const subscribe = useCallback((listener: RealtimeListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    hasConnected.current = false;

    const shouldConnect = enabled ?? import.meta.env.VITE_USE_MOCKS !== 'true';
    if (!shouldConnect || typeof EventSource === 'undefined') return;

    const source = new EventSource('/api/events');

    source.onopen = () => {
      // The first open is the initial load; later opens mean the stream was recycled.
      if (hasConnected.current) setEpoch((value) => value + 1);
      hasConnected.current = true;
    };

    source.onmessage = (message) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse(String(message.data)) as RealtimeEvent;
      } catch {
        return; // not one of ours; never let a bad frame break the stream
      }
      for (const listener of listeners.current) listener(event);
    };

    // onerror is expected (the proxy recycles the stream); EventSource reconnects by itself.
    return () => {
      source.close();
    };
  }, [enabled]);

  const value = useMemo<RealtimeContextValue>(() => ({ subscribe, epoch }), [subscribe, epoch]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
