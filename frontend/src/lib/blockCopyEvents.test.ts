import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { blockCopyEvents } from './blockCopyEvents';

describe('blockCopyEvents', () => {
  let panel: HTMLDivElement;
  let panelText: HTMLParagraphElement;
  let outsideText: HTMLParagraphElement;
  let button: HTMLButtonElement;
  let input: HTMLInputElement;
  let textarea: HTMLTextAreaElement;
  let cleanup: () => void;

  beforeEach(() => {
    panel = document.createElement('div');
    panelText = document.createElement('p');
    panelText.textContent = 'Secret instructions';
    panel.appendChild(panelText);

    outsideText = document.createElement('p');
    outsideText.textContent = 'Normal page text';
    button = document.createElement('button');
    input = document.createElement('input');
    textarea = document.createElement('textarea');

    document.body.append(panel, outsideText, button, input, textarea);
    cleanup = blockCopyEvents(panel);
  });

  afterEach(() => {
    cleanup();
    document.getSelection()?.removeAllRanges();
    document.body.innerHTML = '';
  });

  // Fires the event the browser sends for Ctrl+C, Cmd+C or Edit > Copy.
  function fireCopy(target: EventTarget = document, type: 'copy' | 'cut' = 'copy') {
    const event = new Event(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  }

  function select(element: HTMLElement) {
    document.getSelection()?.selectAllChildren(element);
  }

  it('blocks copy when instruction text is selected', () => {
    select(panelText);

    expect(fireCopy(panelText).defaultPrevented).toBe(true);
  });

  it('blocks cut when instruction text is selected', () => {
    select(panelText);

    expect(fireCopy(panelText, 'cut').defaultPrevented).toBe(true);
  });

  it('blocks a select-all that includes the instruction panel', () => {
    select(document.body);

    expect(fireCopy().defaultPrevented).toBe(true);
  });

  it('still blocks copy when focus moves to a button after selecting instruction text', () => {
    // jsdom clears the selection when focus moves, so focus first, then select.
    // A real browser keeps the selection when you Tab to a button.
    button.focus();
    select(panelText);

    expect(fireCopy(button).defaultPrevented).toBe(true);
  });

  it('allows copying normal text outside the panel', () => {
    select(outsideText);

    expect(fireCopy(outsideText).defaultPrevented).toBe(false);
  });

  it('does nothing when no text is selected', () => {
    expect(fireCopy().defaultPrevented).toBe(false);
  });

  it('allows copying from an input', () => {
    input.focus();

    expect(fireCopy(input).defaultPrevented).toBe(false);
  });

  it('allows copying from a textarea', () => {
    textarea.focus();

    expect(fireCopy(textarea).defaultPrevented).toBe(false);
  });

  it('blocks the right-click menu inside the panel', () => {
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    panelText.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('allows the right-click menu outside the panel', () => {
    const event = new Event('contextmenu', { bubbles: true, cancelable: true });
    outsideText.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('stops blocking after cleanup', () => {
    cleanup();
    select(panelText);

    expect(fireCopy(panelText).defaultPrevented).toBe(false);
  });
});
