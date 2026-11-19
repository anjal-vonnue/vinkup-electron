import { useContext, useEffect, useRef } from 'react';
import {
  RealtimeContext,
  type RealtimeContextValue,
  type RealtimeListener,
} from './RealtimeContext';

/** The stream context, or null when the page renders outside the provider. */
export function useRealtime(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}

/**
 * Calls `listener` for every event the server pushes (this tab only).
 * The latest listener is used without re-subscribing, so a closure over props is safe.
 */
export function useRealtimeEvent(listener: RealtimeListener): void {
  const subscribe = useRealtime()?.subscribe;
  const latest = useRef(listener);

  useEffect(() => {
    latest.current = listener;
  }, [listener]);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((event) => latest.current(event));
  }, [subscribe]);
}

/**
 * Calls `refresh` when the stream reconnects (not on the first connection, and never
 * when there is no provider). Events sent while the proxy was recycling the stream
 * are recovered by re-reading the resource here.
 */
export function useRealtimeRefresh(refresh: () => void): void {
  const epoch = useRealtime()?.epoch ?? 0;
  const latest = useRef(refresh);
  const applied = useRef(epoch);

  useEffect(() => {
    latest.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (epoch === applied.current) return;
    applied.current = epoch;
    latest.current();
  }, [epoch]);
}
