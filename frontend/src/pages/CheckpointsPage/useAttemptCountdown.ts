import { useEffect, useRef, useState } from 'react';
import { getCheckpointAttemptTime } from '../../api/checkpoints';

type UseAttemptCountdownOptions = {
  attemptId: string;
  deadlineAt: string;
  serverNow: string;
  remainingSeconds: number;
  enabled: boolean;
  onExpire: () => void;
  onAlreadySubmitted: () => void;
};

export type AttemptCountdown = {
  remainingSeconds: number;
  label: string;
  warning: 'five-minutes' | 'one-minute' | null;
  expired: boolean;
};

const RESYNC_MS = 15_000;
const FIVE_MINUTES = 5 * 60;
const ONE_MINUTE = 60;

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * A locally ticking countdown anchored to the server's deadline.
 *
 * The browser clock is only used for the interval; the offset between it and
 * the server is measured every 15 seconds. When the deadline passes, the
 * server is still the authority and finalises the attempt independently.
 */
export function useAttemptCountdown({
  attemptId,
  deadlineAt,
  serverNow,
  remainingSeconds,
  enabled,
  onExpire,
  onAlreadySubmitted,
}: UseAttemptCountdownOptions): AttemptCountdown {
  const offsetRef = useRef(0);
  const deadlineRef = useRef(new Date(deadlineAt).getTime());

  const [remaining, setRemaining] = useState(() => Math.max(0, remainingSeconds));
  const [warning, setWarning] = useState<'five-minutes' | 'one-minute' | null>(null);

  const expiredFiredRef = useRef(false);
  const fiveMinuteShownRef = useRef(false);
  const oneMinuteShownRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  const onAlreadySubmittedRef = useRef(onAlreadySubmitted);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    offsetRef.current = new Date(serverNow).getTime() - Date.now();
    deadlineRef.current = new Date(deadlineAt).getTime();
  }, [serverNow, deadlineAt]);

  useEffect(() => {
    onExpireRef.current = onExpire;
    onAlreadySubmittedRef.current = onAlreadySubmitted;
    enabledRef.current = enabled;
  }, [enabled, onExpire, onAlreadySubmitted]);

  useEffect(() => {
    function computeRemaining(): number {
      return Math.max(
        0,
        Math.floor((deadlineRef.current - (Date.now() + offsetRef.current)) / 1000)
      );
    }

    function tick() {
      const next = computeRemaining();
      setRemaining(next);

      if (next > FIVE_MINUTES) {
        setWarning((current) => (current === null ? current : null));
      }
      if (next <= FIVE_MINUTES && next > ONE_MINUTE && !fiveMinuteShownRef.current) {
        fiveMinuteShownRef.current = true;
        setWarning('five-minutes');
      }
      if (next <= ONE_MINUTE && next > 0 && !oneMinuteShownRef.current) {
        oneMinuteShownRef.current = true;
        setWarning('one-minute');
      }
      if (next <= 0 && !expiredFiredRef.current) {
        expiredFiredRef.current = true;
        if (enabledRef.current) onExpireRef.current();
      }
    }

    tick();
    const interval = setInterval(tick, 1000);

    async function resync() {
      try {
        const time = await getCheckpointAttemptTime(attemptId);
        offsetRef.current = new Date(time.serverNow).getTime() - Date.now();
        deadlineRef.current = new Date(time.deadlineAt).getTime();
        setRemaining(Math.max(0, time.remainingSeconds));
        if (time.status === 'SUBMITTED') {
          onAlreadySubmittedRef.current();
        }
      } catch {
        // Keep ticking on the previous deadline; the server enforces it anyway.
      }
    }

    const resyncInterval = setInterval(() => void resync(), RESYNC_MS);
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') void resync();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      clearInterval(resyncInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [attemptId]);

  return {
    remainingSeconds: remaining,
    label: formatDuration(remaining),
    warning: remaining > 0 ? warning : null,
    expired: remaining <= 0,
  };
}
