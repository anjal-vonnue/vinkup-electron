import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminTraineeSummary } from '@itp/types';
import { createAdminTrainee } from '../../api/admin';
import { ApiError } from '../../api/errors';
import AddTraineeDialog from './AddTraineeDialog';

vi.mock('../../api/admin', () => ({ createAdminTrainee: vi.fn() }));

const created: AdminTraineeSummary = {
  id: 't-new',
  name: 'Asha Rao',
  email: 'asha.rao@vonnue.com',
  daysCompleted: 0,
  totalDays: 54,
  currentDay: { id: 'html-day-01', courseTitle: 'HTML', dayNumber: 1, title: 'Structure' },
  todayActiveSeconds: 0,
  totalActiveSeconds: 0,
  totalCodingSeconds: 0,
  lastActiveDate: null,
  latestWpm: null,
  flagsLast7Days: 0,
  averageScore: 0,
  daysScored: 0,
  pendingReviewItems: [],
};

function renderDialog() {
  const onClose = vi.fn();
  const onCreated = vi.fn();
  render(<AddTraineeDialog onClose={onClose} onCreated={onCreated} />);
  return { onClose, onCreated };
}

async function fillAndSubmit(name: string, email: string) {
  if (name) await userEvent.type(screen.getByLabelText('Full name'), name);
  if (email) await userEvent.type(screen.getByLabelText('Company email'), email);
  await userEvent.click(screen.getByRole('button', { name: 'Add trainee' }));
}

beforeEach(() => {
  vi.mocked(createAdminTrainee).mockReset();
  vi.mocked(createAdminTrainee).mockResolvedValue(created);
});

describe('AddTraineeDialog', () => {
  it('opens as a labelled dialog with the name field focused', () => {
    renderDialog();

    expect(screen.getByRole('dialog', { name: 'Add trainee' })).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveFocus();
  });

  it('shows field errors and sends nothing when the form is empty', async () => {
    renderDialog();

    await fillAndSubmit('', '');

    expect(screen.getByText('Enter the trainee’s full name.')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(createAdminTrainee).not.toHaveBeenCalled();
  });

  it('sends the trimmed values and hands the new row to the parent', async () => {
    const { onCreated } = renderDialog();

    await fillAndSubmit('  Asha Rao ', ' asha.rao@vonnue.com ');

    expect(createAdminTrainee).toHaveBeenCalledWith({
      name: 'Asha Rao',
      email: 'asha.rao@vonnue.com',
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('disables the form while saving', async () => {
    vi.mocked(createAdminTrainee).mockReturnValue(new Promise(() => undefined));
    renderDialog();

    await fillAndSubmit('Asha Rao', 'asha.rao@vonnue.com');

    expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByLabelText('Full name')).toBeDisabled();
  });

  it('shows a duplicate email under the email field and lets the mentor try again', async () => {
    vi.mocked(createAdminTrainee).mockRejectedValue(new ApiError(409, 'TRAINEE_EXISTS', 'exists'));
    const { onCreated } = renderDialog();

    await fillAndSubmit('Asha Rao', 'asha.rao@vonnue.com');

    expect(
      await screen.findByText('A trainee with this email already exists.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Company email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Add trainee' })).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('shows an admin email under the email field', async () => {
    vi.mocked(createAdminTrainee).mockRejectedValue(
      new ApiError(409, 'EMAIL_BELONGS_TO_ADMIN', 'admin')
    );
    renderDialog();

    await fillAndSubmit('Mentor', 'mentor@vonnue.com');

    expect(await screen.findByText('This email belongs to a mentor account.')).toBeInTheDocument();
  });

  it('shows other failures as an alert above the buttons', async () => {
    vi.mocked(createAdminTrainee).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Can’t reach the server. Check your connection.')
    );
    renderDialog();

    await fillAndSubmit('Asha Rao', 'asha.rao@vonnue.com');

    expect(await screen.findByRole('alert')).toHaveTextContent('Can’t reach the server.');
  });

  it('closes with Cancel, Escape and a click on the backdrop', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.keyboard('{Escape}');
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on Escape while saving', async () => {
    vi.mocked(createAdminTrainee).mockReturnValue(new Promise(() => undefined));
    const { onClose } = renderDialog();

    await fillAndSubmit('Asha Rao', 'asha.rao@vonnue.com');
    await userEvent.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
  });
});
