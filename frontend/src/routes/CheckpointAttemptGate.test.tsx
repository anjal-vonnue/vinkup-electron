import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '@itp/types';
import { MemoryRouter, Route, Routes } from 'react-router';
import { getActiveCheckpointAttempt } from '../api/checkpoints';
import { CheckpointAttemptGate } from './CheckpointAttemptGate';

vi.mock('../api/checkpoints', () => ({ getActiveCheckpointAttempt: vi.fn() }));
vi.mock('../context/Useauth', () => ({
  useAuth: () => ({ user: { id: 'u1', name: 'Rahul Sharma' } }),
}));

const getActiveCheckpointAttemptMock = vi.mocked(getActiveCheckpointAttempt);
const setActive = vi.fn();

function installDesktop(): void {
  window.desktop = {
    checkpoint: { setActive },
  } as unknown as DesktopApi;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<CheckpointAttemptGate />}>
          <Route path="/checkpoints" element={<span>checkpoints</span>} />
          <Route path="/checkpoints/:checkpointId" element={<span>detail</span>} />
          <Route path="/checkpoints/attempts/:attemptId" element={<span>attempt</span>} />
          <Route path="/" element={<span>home</span>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  setActive.mockClear();
  getActiveCheckpointAttemptMock.mockReset();
  getActiveCheckpointAttemptMock.mockResolvedValue(null);
  installDesktop();
});

afterEach(() => {
  cleanup();
  delete (window as { desktop?: DesktopApi }).desktop;
});

describe('CheckpointAttemptGate', () => {
  it('shows the good-luck screen on the checkpoints list', () => {
    renderAt('/checkpoints');

    expect(setActive).toHaveBeenCalledWith('Rahul Sharma');
  });

  it('shows the good-luck screen on a checkpoint detail page', () => {
    renderAt('/checkpoints/checkpoint-1');

    expect(setActive).toHaveBeenCalledWith('Rahul Sharma');
  });

  it('shows the good-luck screen during an attempt', () => {
    renderAt('/checkpoints/attempts/attempt-1');

    expect(setActive).toHaveBeenCalledWith('Rahul Sharma');
  });

  it('restores the normal secondary display outside the checkpoints section', async () => {
    renderAt('/');

    expect(setActive).toHaveBeenLastCalledWith(null);
    await waitFor(() => expect(getActiveCheckpointAttemptMock).toHaveBeenCalled());
  });
});
