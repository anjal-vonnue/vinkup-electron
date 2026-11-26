import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import type { TraineeCheckpointSummary } from '@itp/types';
import { getMyCheckpoints } from '../../api/checkpoints';
import { useAuth } from '../../context/Useauth';
import { useRealtime, useRealtimeEvent, useRealtimeRefresh } from '../../context/useRealtime';

const SEEN_PREFIX = 'vinkup.checkpoints.seen:';

function publishedKey(checkpointId: string): string {
  return `${checkpointId}:published`;
}

function resultsKey(checkpoint: TraineeCheckpointSummary): string | null {
  const at = checkpoint.resultsPublishedAt ?? checkpoint.attempt?.gradedAt;
  return at ? `${checkpoint.id}:results:${at}` : null;
}

function readSeen(traineeId: string): Set<string> {
  try {
    const raw = window.localStorage.getItem(`${SEEN_PREFIX}${traineeId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === 'string')
        : []
    );
  } catch {
    return new Set();
  }
}

function writeSeen(traineeId: string, keys: Set<string>): void {
  try {
    window.localStorage.setItem(`${SEEN_PREFIX}${traineeId}`, JSON.stringify([...keys]));
  } catch {
    // The badge is an enhancement; blocked storage must not break the header.
  }
}

/** Every notification key the list currently represents for this trainee. */
function visibleKeys(checkpoints: TraineeCheckpointSummary[]): string[] {
  const keys: string[] = [];
  for (const checkpoint of checkpoints) {
    keys.push(publishedKey(checkpoint.id));
    const result = resultsKey(checkpoint);
    if (checkpoint.availability === 'RESULTS_AVAILABLE' && result) keys.push(result);
  }
  return keys;
}

/** Announced checkpoints and results the trainee has not seen yet. */
function unseenKeys(checkpoints: TraineeCheckpointSummary[], seen: Set<string>): string[] {
  const keys: string[] = [];
  for (const checkpoint of checkpoints) {
    // A scheduled checkpoint counts from the moment it is published, even while
    // it is still upcoming, so a trainee knows it exists before it opens.
    if (
      (checkpoint.availability === 'UPCOMING' || checkpoint.availability === 'AVAILABLE') &&
      !seen.has(publishedKey(checkpoint.id))
    ) {
      keys.push(publishedKey(checkpoint.id));
    }
    if (checkpoint.availability === 'RESULTS_AVAILABLE') {
      const key = resultsKey(checkpoint);
      if (key && !seen.has(key)) keys.push(key);
    }
  }
  return keys;
}

/**
 * Drives the unread dot on the header's Checkpoints link.
 *
 * The dot appears when a checkpoint is published (realtime) or when results are
 * published (realtime), and on load for anything the trainee has not seen yet.
 * Opening any Checkpoints page marks everything currently shown as seen.
 */
export function useCheckpointNotifications(): { hasUnread: boolean } {
  const { user } = useAuth();
  const realtime = useRealtime();
  const location = useLocation();
  const viewingCheckpoints = location.pathname.startsWith('/checkpoints');

  const traineeId = user?.id;
  const hasRealtime = realtime !== null;
  const [hasUnread, setHasUnread] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((value) => value + 1), []);
  const markSeen = useCallback(
    (keys: string[]) => {
      if (!traineeId) return;
      const seen = readSeen(traineeId);
      let changed = false;
      for (const key of keys) {
        if (!seen.has(key)) {
          seen.add(key);
          changed = true;
        }
      }
      if (changed) writeSeen(traineeId, seen);
      setHasUnread(false);
    },
    [traineeId]
  );

  useEffect(() => {
    // The header is also used outside the authenticated shell (e.g. tests), where
    // there is no realtime stream and no trainee list to read.
    if (!hasRealtime || !traineeId) return;
    let cancelled = false;
    void getMyCheckpoints()
      .then((rows) => {
        if (cancelled) return;
        // Looking at the Checkpoints section marks everything it shows as seen,
        // so a reload keeps old items quiet.
        if (viewingCheckpoints) {
          markSeen(visibleKeys(rows));
          return;
        }
        setHasUnread(unseenKeys(rows, readSeen(traineeId)).length > 0);
      })
      .catch(() => {
        // The badge is best-effort; the Checkpoints page still loads on its own.
      });
    return () => {
      cancelled = true;
    };
  }, [hasRealtime, traineeId, reloadKey, markSeen, viewingCheckpoints]);

  // Events sent while the stream was reconnecting are recovered by re-reading.
  useRealtimeRefresh(reload);

  useRealtimeEvent((event) => {
    let key: string;
    if (event.type === 'checkpoint.published') {
      key = publishedKey(event.checkpointId);
    } else if (event.type === 'checkpoint.results.published') {
      key = `${event.checkpointId}:results:${event.publishedAt}`;
    } else {
      return;
    }

    if (viewingCheckpoints) {
      markSeen([key]);
      return;
    }
    setHasUnread(true);
  });

  return { hasUnread: hasUnread && !viewingCheckpoints };
}
