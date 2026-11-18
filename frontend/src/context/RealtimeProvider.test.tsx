import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent } from '@itp/types';
import { RealtimeProvider } from './RealtimeProvider';
import { useRealtimeEvent, useRealtimeRefresh } from './useRealtime';
import { installFakeEventSource, type FakeEventSourceHandle } from '../test/fakeEventSource';

function EventProbe({ onEvent }: { onEvent: (event: RealtimeEvent) => void }) {
  useRealtimeEvent(onEvent);
  return null;
}

function RefreshProbe({ onRefresh }: { onRefresh: () => void }) {
  useRealtimeRefresh(onRefresh);
  return null;
}

const approved: RealtimeEvent = {
  type: 'task.reviewed',
  taskId: 't1',
  decision: 'approved',
  reviewStatus: 'approved',
  submissionNo: 1,
  feedback: '',
  reviewedAt: '2026-11-18T10:00:00.000Z',
};

let fake: FakeEventSourceHandle;

beforeEach(() => {
  fake = installFakeEventSource();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RealtimeProvider', () => {
  it('opens one stream and hands each event to every listener', () => {
    const first = vi.fn();
    const second = vi.fn();

    render(
      <RealtimeProvider enabled>
        <EventProbe onEvent={first} />
        <EventProbe onEvent={second} />
      </RealtimeProvider>
    );

    expect(fake.source?.url).toBe('/api/events');

    act(() => fake.source?.emit(approved));

    expect(first).toHaveBeenCalledWith(approved);
    expect(second).toHaveBeenCalledWith(approved);
  });

  it('ignores a frame that is not JSON', () => {
    const listener = vi.fn();

    render(
      <RealtimeProvider enabled>
        <EventProbe onEvent={listener} />
      </RealtimeProvider>
    );

    act(() => fake.source?.emit('not json'));

    expect(listener).not.toHaveBeenCalled();
  });

  it('closes the stream on unmount', () => {
    const { unmount } = render(
      <RealtimeProvider enabled>
        <EventProbe onEvent={vi.fn()} />
      </RealtimeProvider>
    );
    const source = fake.source;

    unmount();

    expect(source?.closed).toBe(true);
  });

  it('does not connect when disabled', () => {
    render(
      <RealtimeProvider enabled={false}>
        <EventProbe onEvent={vi.fn()} />
      </RealtimeProvider>
    );

    expect(fake.source).toBeNull();
  });

  it('refreshes on a reconnect, but not on the first connection', () => {
    const refresh = vi.fn();

    render(
      <RealtimeProvider enabled>
        <RefreshProbe onRefresh={refresh} />
      </RealtimeProvider>
    );

    act(() => fake.source?.emitOpen());
    expect(refresh).not.toHaveBeenCalled();

    // The proxy recycled the stream and EventSource reconnected.
    act(() => fake.source?.emitOpen());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
