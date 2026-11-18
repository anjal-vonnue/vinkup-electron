import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api/errors';
import { useAdminResource } from './useAdminResource';

describe('useAdminResource', () => {
  it('loads nothing for a null fetcher', () => {
    const { result } = renderHook(() => useAdminResource<string>(null));

    expect(result.current).toMatchObject({ data: null, error: null, isLoading: false });
  });

  it('starts loading, then returns the data', async () => {
    const fetcher = vi.fn().mockResolvedValue('hello');
    const { result } = renderHook(() => useAdminResource(fetcher));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('hello'));
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps an ApiError as it is', async () => {
    const error = new ApiError(404, 'NOT_FOUND', 'Trainee not found.');
    const fetcher = vi.fn().mockRejectedValue(error);
    const { result } = renderHook(() => useAdminResource(fetcher));

    await waitFor(() => expect(result.current.error).toBe(error));
    expect(result.current.data).toBeNull();
  });

  it('retry loads again', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'Boom'))
      .mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useAdminResource(fetcher));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.retry());

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe('ok'));
    expect(result.current.error).toBeNull();
  });

  it('refresh loads again but keeps the old data until the new data arrives', async () => {
    let resolveSecond: (value: string) => void = () => {};
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce('old')
      .mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveSecond = resolve;
        })
      );
    const { result } = renderHook(() => useAdminResource(fetcher));
    await waitFor(() => expect(result.current.data).toBe('old'));

    act(() => result.current.refresh());

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result.current.data).toBe('old');
    expect(result.current.isLoading).toBe(false);

    act(() => resolveSecond('new'));
    await waitFor(() => expect(result.current.data).toBe('new'));
  });

  it("never shows the previous fetcher's data after the fetcher changes", async () => {
    let resolveSecond: (value: string) => void = () => {};
    const first = vi.fn().mockResolvedValue('first');
    const second = vi.fn(() => new Promise<string>((resolve) => (resolveSecond = resolve)));

    const { result, rerender } = renderHook(({ fetcher }) => useAdminResource(fetcher), {
      initialProps: { fetcher: first as () => Promise<string> },
    });
    await waitFor(() => expect(result.current.data).toBe('first'));

    rerender({ fetcher: second });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);

    act(() => resolveSecond('second'));
    await waitFor(() => expect(result.current.data).toBe('second'));
  });

  it('ignores a slow answer from an older fetcher', async () => {
    let resolveFirst: (value: string) => void = () => {};
    const first = vi.fn(() => new Promise<string>((resolve) => (resolveFirst = resolve)));
    const second = vi.fn().mockResolvedValue('second');

    const { result, rerender } = renderHook(({ fetcher }) => useAdminResource(fetcher), {
      initialProps: { fetcher: first },
    });
    rerender({ fetcher: second });
    await waitFor(() => expect(result.current.data).toBe('second'));

    act(() => resolveFirst('first'));

    expect(result.current.data).toBe('second');
  });
});
