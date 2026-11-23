import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast/Toast';
import {
  deleteMentorSlackChannel,
  getMentorSlackChannel,
  saveMentorSlackChannel,
} from '../../api/admin';
import { toApiError } from '../../api/errors';
import SlackIntegrationSection from './SlackIntegrationSection';

vi.mock('../../api/admin', () => ({
  getMentorSlackChannel: vi.fn(),
  saveMentorSlackChannel: vi.fn(),
  deleteMentorSlackChannel: vi.fn(),
}));

vi.mock('../../api/errors', () => ({
  toApiError: (error: unknown) => ({
    message: error instanceof Error ? error.message : 'Unexpected error',
  }),
}));

function renderSection() {
  return render(
    <ToastProvider>
      <SlackIntegrationSection />
    </ToastProvider>
  );
}

describe('SlackIntegrationSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows configuration input when no channel is configured', async () => {
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: null });
    renderSection();

    expect(await screen.findByLabelText('Slack Channel ID')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save Channel' })).toBeInTheDocument();
  });

  it('displays existing channel configuration', async () => {
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: 'C0123ABCDEF' });
    renderSection();

    expect(await screen.findByText('C0123ABCDEF', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('adds a channel', async () => {
    const user = userEvent.setup();
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: null });
    vi.mocked(saveMentorSlackChannel).mockResolvedValue({ channelId: 'C0123ABCDEF' });
    renderSection();

    await screen.findByLabelText('Slack Channel ID');
    await user.type(screen.getByLabelText('Slack Channel ID'), 'c0123abcdef');
    await user.click(screen.getByRole('button', { name: 'Save Channel' }));

    await waitFor(() => {
      expect(saveMentorSlackChannel).toHaveBeenCalledWith({ channelId: 'C0123ABCDEF' });
    });
    expect(await screen.findByText('C0123ABCDEF', { selector: 'code' })).toBeInTheDocument();
  });

  it('updates a channel', async () => {
    const user = userEvent.setup();
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: 'C0123ABCDEF' });
    vi.mocked(saveMentorSlackChannel).mockResolvedValue({ channelId: 'C9999UPDATED' });
    renderSection();

    await screen.findByText('C0123ABCDEF', { selector: 'code' });
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const input = screen.getByLabelText('Slack Channel ID');
    await user.clear(input);
    await user.type(input, 'C9999UPDATED');
    await user.click(screen.getByRole('button', { name: 'Save Channel' }));

    await waitFor(() => {
      expect(saveMentorSlackChannel).toHaveBeenCalledWith({ channelId: 'C9999UPDATED' });
    });
    expect(await screen.findByText('C9999UPDATED', { selector: 'code' })).toBeInTheDocument();
  });

  it('requires confirmation before deleting a channel', async () => {
    const user = userEvent.setup();
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: 'C0123ABCDEF' });
    vi.mocked(deleteMentorSlackChannel).mockResolvedValue({ channelId: null });
    renderSection();

    await screen.findByText('C0123ABCDEF', { selector: 'code' });
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Task submission notifications will stop/i)).toBeInTheDocument();
    expect(deleteMentorSlackChannel).not.toHaveBeenCalled();
  });

  it('deletes a channel after confirmation', async () => {
    const user = userEvent.setup();
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: 'C0123ABCDEF' });
    vi.mocked(deleteMentorSlackChannel).mockResolvedValue({ channelId: null });
    renderSection();

    await screen.findByText('C0123ABCDEF', { selector: 'code' });
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(deleteMentorSlackChannel).toHaveBeenCalled();
    });
    expect(await screen.findByLabelText('Slack Channel ID')).toBeInTheDocument();
  });

  it('shows validation errors for invalid input', async () => {
    const user = userEvent.setup();
    vi.mocked(getMentorSlackChannel).mockResolvedValue({ channelId: null });
    renderSection();

    await screen.findByLabelText('Slack Channel ID');
    await user.type(screen.getByLabelText('Slack Channel ID'), 'bad id');
    await user.click(screen.getByRole('button', { name: 'Save Channel' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid Slack channel ID.');
    expect(saveMentorSlackChannel).not.toHaveBeenCalled();
  });

  it('shows load error state', async () => {
    vi.mocked(getMentorSlackChannel).mockRejectedValue(new Error('Network failed'));
    renderSection();

    expect(await screen.findByRole('alert')).toHaveTextContent('Network failed');
  });
});
