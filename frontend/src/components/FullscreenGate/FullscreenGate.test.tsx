import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FullscreenGate from './FullscreenGate';

const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  user: null as { role: 'trainee' | 'mentor' | 'manager' } | null,
}));
const requestAppFullscreen = vi.hoisted(() => vi.fn());
vi.mock('../../context/Useauth', () => ({ useAuth: () => auth }));
vi.mock('../../lib/fullscreen', () => ({ requestAppFullscreen }));

function setFullscreen(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  act(() => {
    document.dispatchEvent(new Event('fullscreenchange'));
  });
}

function renderGate() {
  return render(
    <FullscreenGate>
      <p>app content</p>
    </FullscreenGate>
  );
}

describe('FullscreenGate', () => {
  afterEach(() => {
    auth.isAuthenticated = true;
    auth.user = null;
    setFullscreen(null);
    vi.clearAllMocks();
  });

  it('blocks the app while signed in and not fullscreen', () => {
    renderGate();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('app content').closest('[inert]')).not.toBeNull();
  });

  it('lets the trainee work in fullscreen and blocks again after leaving', () => {
    renderGate();
    setFullscreen(document.body);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('app content').closest('[inert]')).toBeNull();

    setFullscreen(null);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('does not block signed-out pages such as login', () => {
    auth.isAuthenticated = false;
    renderGate();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('requests fullscreen from the button', async () => {
    requestAppFullscreen.mockResolvedValue(true);
    renderGate();
    await userEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(requestAppFullscreen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when the browser refuses', async () => {
    requestAppFullscreen.mockResolvedValue(false);
    renderGate();
    await userEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('blocks a signed-in trainee who is not fullscreen', () => {
    auth.user = { role: 'trainee' };
    renderGate();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('never blocks a mentor (staff are not monitored)', () => {
    auth.user = { role: 'mentor' };
    renderGate();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('app content').closest('[inert]')).toBeNull();
  });
});
