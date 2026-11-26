import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CheckpointGroup, ManagerTrainee } from '@itp/types';
import CheckpointGroupsDialog from './CheckpointGroupsDialog';
import { updateCheckpointGroup } from '../../api/checkpoints';
import { ToastProvider } from '../../components/Toast';

vi.mock('../../api/checkpoints', () => ({
  createCheckpointGroup: vi.fn(),
  updateCheckpointGroup: vi.fn(),
  deleteCheckpointGroup: vi.fn(),
}));

const active: ManagerTrainee = {
  id: 't1',
  name: 'Active One',
  email: 'active@example.com',
  isActive: true,
  mentor: null,
};

const inactive: ManagerTrainee = {
  id: 't2',
  name: 'Inactive Two',
  email: 'inactive@example.com',
  isActive: false,
  mentor: null,
};

const group: CheckpointGroup = {
  id: 'group-1',
  name: 'Batch A',
  createdAt: new Date().toISOString(),
  members: [
    { id: active.id, name: active.name, email: active.email, isActive: true },
    { id: inactive.id, name: inactive.name, email: inactive.email, isActive: false },
  ],
};

function renderDialog() {
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <CheckpointGroupsDialog
        trainees={[active, inactive]}
        groups={[group]}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    </ToastProvider>
  );
  return { onChanged };
}

describe('CheckpointGroupsDialog', () => {
  it('does not offer deactivated trainees when creating a group', () => {
    renderDialog();

    expect(screen.getByRole('checkbox', { name: /Active One/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Inactive Two/ })).not.toBeInTheDocument();
  });

  it('keeps deactivated members visible so they can be removed', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: 'Edit Batch A' }));

    const inactiveCheckbox = screen.getByRole('checkbox', { name: /Inactive Two/ });
    expect(inactiveCheckbox).toBeChecked();

    await user.click(inactiveCheckbox);
    await user.click(screen.getByRole('button', { name: 'Update group' }));

    await waitFor(() =>
      expect(updateCheckpointGroup).toHaveBeenCalledWith('group-1', {
        name: 'Batch A',
        traineeIds: ['t1'],
      })
    );
  });
});
