import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../../api/errors';

type Fetcher<T> = () => Promise<T>;

type Settled<T> = { fetcher: Fetcher<T>; data: T | null; error: ApiError | null };

export type Resource<T> = {
  data: T | null;
  error: ApiError | null;
  isLoading: boolean;
  retry: () => void;
  /** Loads again but keeps showing the current data until the new data arrives (no loader). */
  refresh: () => void;
};

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const message =
    error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  return new ApiError(0, 'INTERNAL_ERROR', message);
}

/**
 * Loads one thing through an api/ function.
 *
 * Pass a memoised fetcher (useCallback / useMemo). A new fetcher starts a new load, and the
 * result of an older one is ignored, so data for one trainee never shows under another.
 * Pass null to load nothing.
 */
export function useAdminResource<T>(fetcher: Fetcher<T> | null): Resource<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!fetcher) return;

    let isCurrent = true;
    fetcher()
      .then((data) => {
        if (isCurrent) setSettled({ fetcher, data, error: null });
      })
      .catch((error: unknown) => {
        if (isCurrent) setSettled({ fetcher, data: null, error: toApiError(error) });
      });

    return () => {
      isCurrent = false;
    };
  }, [fetcher, attempt]);

  const retry = useCallback(() => {
    setSettled(null);
    setAttempt((count) => count + 1);
  }, []);

  // Same as retry, but the old data stays on screen, so the page does not flash a loader.
  const refresh = useCallback(() => {
    setAttempt((count) => count + 1);
  }, []);

  const current =
    fetcher !== null && settled !== null && settled.fetcher === fetcher ? settled : null;

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    isLoading: fetcher !== null && current === null,
    retry,
    refresh,
  };
}
