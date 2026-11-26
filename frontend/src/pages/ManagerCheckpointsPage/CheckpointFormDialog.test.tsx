import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ManagerTrainee } from '@itp/types';
import CheckpointFormDialog from './CheckpointFormDialog';

function renderDialog(trainees: ManagerTrainee[] = []) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <CheckpointFormDialog
      target={{ mode: 'create' }}
      trainees={trainees}
      groups={[]}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
  const dialog = screen.getByRole('dialog', { hidden: true });
  const fileInput = view.container.querySelector('input[type="file"]');
  if (!(fileInput instanceof HTMLInputElement)) throw new Error('The file input did not render.');
  return { dialog, fileInput, onClose };
}

async function openStarterFiles() {
  const user = userEvent.setup();
  const rendered = renderDialog();
  await user.click(screen.getByRole('button', { name: /Practical Test/ }));
  return { user, ...rendered };
}

describe('CheckpointFormDialog', () => {
  it('stays open when the file picker is cancelled', () => {
    const { fileInput, onClose } = renderDialog();

    // Dismissing the OS file picker fires a bubbling `cancel` on the input.
    fileInput.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape, which fires `cancel` on the dialog itself', () => {
    const { dialog, onClose } = renderDialog();

    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a starter file from the New file row', async () => {
    const { user, onClose } = await openStarterFiles();

    await user.click(screen.getByRole('button', { name: 'New file' }));
    await user.type(screen.getByLabelText('New file path'), 'src/app.ts{Enter}');

    expect(screen.getByText('src/app.ts')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('// Content of src/app.ts')).toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not add the same starter file twice', async () => {
    const { user } = await openStarterFiles();
    const addFile = async (path: string) => {
      await user.click(screen.getByRole('button', { name: 'New file' }));
      await user.type(screen.getByLabelText('New file path'), `${path}{Enter}`);
    };

    await addFile('index.js');
    await addFile('index.js');

    expect(screen.getAllByText('index.js')).toHaveLength(1);
    expect(screen.getByText('1 file')).toBeInTheDocument();
  });

  it('does not list deactivated trainees', () => {
    renderDialog([
      {
        id: 'trainee-active',
        name: 'Active Trainee',
        email: 'active@example.com',
        isActive: true,
        mentor: null,
      },
      {
        id: 'trainee-inactive',
        name: 'Inactive Trainee',
        email: 'inactive@example.com',
        isActive: false,
        mentor: null,
      },
    ]);

    expect(screen.getByText('Active Trainee')).toBeInTheDocument();
    expect(screen.queryByText('Inactive Trainee')).not.toBeInTheDocument();
  });

  it('cancels the New file row with Escape without adding a file', async () => {
    const { user, onClose } = await openStarterFiles();

    await user.click(screen.getByRole('button', { name: 'New file' }));
    await user.type(screen.getByLabelText('New file path'), 'draft.js{Escape}');

    expect(screen.queryByLabelText('New file path')).not.toBeInTheDocument();
    expect(screen.queryByText('draft.js')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
