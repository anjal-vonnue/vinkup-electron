import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthState = {
  isAuthenticated: boolean;
  user: { role: 'trainee' | 'mentor' | 'manager' } | null;
};

const auth = vi.hoisted<AuthState>(() => ({
  isAuthenticated: true,
  user: { role: 'trainee' },
}));

const activityApi = vi.hoisted(() => ({
  postActivityTime: vi.fn(),
  postActivityTimeOnExit: vi.fn(),
}));

vi.mock('../Useauth', () => ({ useAuth: () => auth }));
vi.mock('../../api/activity', () => activityApi);

import { ActivityProvider } from '../ActivityProvider';

function renderProvider() {
  return render(
    <ActivityProvider>
      <p>page</p>
    </ActivityProvider>
  );
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  activityApi.postActivityTime.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  auth.isAuthenticated = true;
  auth.user = { role: 'trainee' };
});

describe('ActivityProvider', () => {
  it('sends a trainee’s active time after a minute', async () => {
    renderProvider();

    await advance(61_000);

    expect(activityApi.postActivityTime).toHaveBeenCalled();
    const [batch] = activityApi.postActivityTime.mock.calls[0] as [{ activeSeconds: number }];
    expect(batch.activeSeconds).toBeGreaterThan(0);
  });

  it('never tracks or sends time for a mentor', async () => {
    auth.user = { role: 'mentor' };
    renderProvider();

    await advance(130_000);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    expect(activityApi.postActivityTime).not.toHaveBeenCalled();
    expect(activityApi.postActivityTimeOnExit).not.toHaveBeenCalled();
  });

  it('does not track a signed-out visitor', async () => {
    auth.isAuthenticated = false;
    auth.user = null;
    renderProvider();

    await advance(130_000);

    expect(activityApi.postActivityTime).not.toHaveBeenCalled();
  });
});
