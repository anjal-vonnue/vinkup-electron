import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import Editor from '@monaco-editor/react';
import InstructionsPanel from './InstructionsPanel';

const MARKDOWN = '## Build a todo app\n\nUse React state. See [day 1](/days/1).';
const OLD_CLIPBOARD = 'old clipboard';

// A small page: the instruction panel plus the things that must keep working.
// '@monaco-editor/react' is replaced by a <textarea> in src/test/setup.ts,
// which matches how the real Monaco editor receives keyboard input.
async function renderPage() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <InstructionsPanel markdown={MARKDOWN} />
      <p>Normal page text</p>
      <input aria-label="Name" />
      <textarea aria-label="Notes" />
      <Editor options={{ ariaLabel: 'Code editor' }} />
      <button type="button">Next</button>
    </MemoryRouter>
  );
  await navigator.clipboard.writeText(OLD_CLIPBOARD);
  return user;
}

function selectText(element: HTMLElement) {
  document.getSelection()?.selectAllChildren(element);
}

// Presses the shortcut, then copies like the browser would after that shortcut.
// jsdom doesn't turn Ctrl+C / Cmd+C into a copy by itself, so we call user.copy().
async function pressCopyShortcut(user: UserEvent, shortcut: string) {
  await user.keyboard(shortcut);
  await user.copy();
  return navigator.clipboard.readText();
}

const CTRL_C = '{Control>}c{/Control}';
// Only used where focus isn't in a text field: user-event types a "c" into a
// focused field while Meta is held, which a real Mac doesn't do.
const CMD_C = '{Meta>}c{/Meta}';

describe('InstructionsPanel copy protection', () => {
  it('renders the instructions so students can read them', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { name: 'Build a todo app' })).toBeInTheDocument();
    expect(screen.getByText(/Use React state/)).toBeVisible();
  });

  it('does not copy instruction text with Ctrl+C', async () => {
    const user = await renderPage();
    selectText(screen.getByText(/Use React state/));

    expect(await pressCopyShortcut(user, CTRL_C)).toBe(OLD_CLIPBOARD);
  });

  it('does not copy instruction text with Cmd+C', async () => {
    const user = await renderPage();
    selectText(screen.getByText(/Use React state/));

    expect(await pressCopyShortcut(user, CMD_C)).toBe(OLD_CLIPBOARD);
  });

  it('does not copy instruction text after focus moves to another element', async () => {
    const user = await renderPage();
    // jsdom clears the selection when focus moves, so focus first, then select.
    await user.click(screen.getByRole('button', { name: 'Next' }));
    selectText(screen.getByText(/Use React state/));

    expect(await pressCopyShortcut(user, CTRL_C)).toBe(OLD_CLIPBOARD);
  });

  it('blocks the right-click menu inside the instructions only', async () => {
    await renderPage();

    // fireEvent returns false when the event was cancelled.
    expect(fireEvent.contextMenu(screen.getByText(/Use React state/))).toBe(false);
    expect(fireEvent.contextMenu(screen.getByText('Normal page text'))).toBe(true);
  });

  it('still copies normal text outside the instructions', async () => {
    const user = await renderPage();
    selectText(screen.getByText('Normal page text'));

    expect(await pressCopyShortcut(user, CTRL_C)).toBe('Normal page text');
  });

  it('still allows typing and copying in an input', async () => {
    const user = await renderPage();
    const input = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });

    await user.type(input, 'hello');
    expect(input).toHaveValue('hello');

    input.setSelectionRange(0, 5);
    expect(await pressCopyShortcut(user, CTRL_C)).toBe('hello');
  });

  it('still allows typing and copying in a textarea', async () => {
    const user = await renderPage();
    const textarea = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Notes' });

    await user.type(textarea, 'my notes');
    expect(textarea).toHaveValue('my notes');

    textarea.setSelectionRange(0, 8);
    expect(await pressCopyShortcut(user, CTRL_C)).toBe('my notes');
  });

  it('still allows typing and copying in the code editor', async () => {
    const user = await renderPage();
    const editor = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Code editor' });

    await user.type(editor, 'const x = 1;');
    expect(editor).toHaveValue('const x = 1;');

    editor.setSelectionRange(0, 12);
    expect(await pressCopyShortcut(user, CTRL_C)).toBe('const x = 1;');
  });

  it('does not block scrolling keys or the mouse wheel inside the instructions', async () => {
    await renderPage();
    const text = screen.getByText(/Use React state/);

    expect(fireEvent.wheel(text, { deltaY: 100 })).toBe(true);
    expect(fireEvent.keyDown(text, { key: 'PageDown' })).toBe(true);
    expect(fireEvent.keyDown(text, { key: 'ArrowDown' })).toBe(true);
  });

  it('keeps links in the instructions reachable with the keyboard', async () => {
    const user = await renderPage();

    await user.tab();

    expect(screen.getByRole('link', { name: 'day 1' })).toHaveFocus();
  });
});
