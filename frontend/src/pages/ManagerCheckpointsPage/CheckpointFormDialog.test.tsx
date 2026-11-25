import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CheckpointFormDialog from './CheckpointFormDialog';

function renderDialog() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <CheckpointFormDialog
      target={{ mode: 'create' }}
      trainees={[]}
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
});
