import { describe, it, expect, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SaveState } from '../../pages/TaskPage/hooks/useAutosave';
import SubmitTaskButton from './SubmitTaskButton';

const savedState: SaveState = { status: 'saved', lastSavedAt: null, message: null };

function renderButton(overrides: Partial<ComponentProps<typeof SubmitTaskButton>> = {}) {
  const props = {
    taskTitle: 'Services Grid Layout',
    hasSubmitted: false,
    saveState: savedState,
    flush: vi.fn(() => Promise.resolve(true)),
    onSubmit: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<SubmitTaskButton {...props} />);
  return props;
}

function submitButton() {
  return screen.getByRole('button', { name: /submit task|resubmit|submitting/i });
}

describe('SubmitTaskButton', () => {
  it.each(['offline', 'error', 'blocked'] as const)(
    'is disabled with a tooltip while the save status is %s',
    (status) => {
      renderButton({ saveState: { status, lastSavedAt: null, message: 'x' } });

      expect(submitButton()).toBeDisabled();
      expect(submitButton()).toHaveAttribute('title', "Your latest changes aren't saved yet.");
    }
  );

  it.each(['saved', 'dirty', 'saving'] as const)(
    'is enabled while the save status is %s',
    (status) => {
      renderButton({ saveState: { status, lastSavedAt: null, message: null } });
      expect(submitButton()).toBeEnabled();
      expect(submitButton()).not.toHaveAttribute('title');
    }
  );

  it('asks first, with "Keep working" focused', async () => {
    const user = userEvent.setup();
    renderButton();

    await user.click(submitButton());

    expect(screen.getByRole('heading', { name: 'Submit this task?' })).toBeInTheDocument();
    expect(
      screen.getByText(/latest saved code for 'Services Grid Layout'\. You can keep working/)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep working' })).toHaveFocus();
  });

  it('saves first, then submits, then closes the dialog', async () => {
    const user = userEvent.setup();
    const order: string[] = [];
    const { flush, onSubmit } = renderButton({
      flush: vi.fn(() => {
        order.push('flush');
        return Promise.resolve(true);
      }),
      onSubmit: vi.fn(() => {
        order.push('submit');
        return Promise.resolve();
      }),
    });

    await user.click(submitButton());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(order).toEqual(['flush', 'submit']);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });

  it('does not submit when the save fails, and says why', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderButton({ flush: vi.fn(() => Promise.resolve(false)) });

    await user.click(submitButton());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      "We couldn't save your latest changes. Check your connection and try again."
    );
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('open');
  });

  it("shows the server's message when submitting fails, keeps the dialog open and re-enables", async () => {
    const user = userEvent.setup();
    renderButton({ onSubmit: vi.fn(() => Promise.reject(new Error('This day is locked.'))) });

    await user.click(submitButton());
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('alert')).toHaveTextContent('This day is locked.');
    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
    expect(submitButton()).toBeEnabled();
  });

  it('sends one request for two quick confirms', async () => {
    let finishSubmit: () => void = () => {};
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSubmit = resolve;
        })
    );
    const user = userEvent.setup();
    renderButton({ onSubmit });

    await user.click(submitButton());
    const confirm = screen.getByRole('button', { name: 'Submit' });
    // Two clicks in the same tick, before React re-renders the button as disabled.
    act(() => {
      confirm.click();
      confirm.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('button', { name: /submitting/i })).toBeDisabled();
    await act(async () => {
      finishSubmit();
      await Promise.resolve();
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('calls nothing on Keep working', async () => {
    const user = userEvent.setup();
    const { flush, onSubmit } = renderButton();

    await user.click(submitButton());
    await user.click(screen.getByRole('button', { name: 'Keep working' }));

    expect(flush).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { hidden: true })).not.toHaveAttribute('open');
  });

  it('reads "Resubmit" once submitted', () => {
    renderButton({ hasSubmitted: true });
    expect(submitButton()).toHaveTextContent('Resubmit');
  });

  it('reads "Submit Task" before the first submit', () => {
    renderButton();
    expect(submitButton()).toHaveTextContent('Submit Task');
  });

  it('is disabled and reads "Approved" once an admin approves the task', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderButton({ reviewStatus: 'approved', hasSubmitted: true });

    const button = screen.getByRole('button', { name: 'Approved' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'title',
      'This task has been approved and cannot be resubmitted.'
    );

    await user.click(button);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks to resubmit when the task is in rework', () => {
    renderButton({ reviewStatus: 'rework', hasSubmitted: true });
    expect(submitButton()).toHaveTextContent('Resubmit');
  });
});
