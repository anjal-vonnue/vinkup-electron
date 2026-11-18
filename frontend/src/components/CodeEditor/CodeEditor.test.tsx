// @vitest-environment jsdom

import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EditorProvider, useEditorRef } from '../../pages/TaskPage/state/EditorContext';
import { ToastProvider } from '../../components/Toast';
import { fakeEditor, fakeMonaco } from '../../test/setup';
import CodeEditor from './CodeEditor';

const noop = () => {};

function Harness({ onChange = noop }: { onChange?: (path: string, content: string) => void }) {
  return (
    <ToastProvider>
      <EditorProvider>
        <CodeEditor
          taskId="t1"
          path="a.ts"
          onChange={onChange}
          onCursorChange={noop}
          onSave={noop}
          onRun={noop}
        />
      </EditorProvider>
    </ToastProvider>
  );
}

/**
 * Sets the application's active theme.
 */
function setAppTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
}

describe('CodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppTheme('light');
  });

  it('calls onChange with the path and new value when typing in the stub', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText('a.ts code editor'), 'x');

    expect(onChange).toHaveBeenCalledWith('a.ts', expect.any(String));
  });

  it('stores the editor instance in the editor context on mount', async () => {
    function Marker() {
      const editorRef = useEditorRef();
      const [matched, setMatched] = useState(false);

      useEffect(() => {
        setMatched((editorRef.current as unknown) === fakeEditor);
      }, [editorRef]);

      return <div data-testid="captured">{matched ? 'matched' : 'not-matched'}</div>;
    }

    render(
      <ToastProvider>
        <EditorProvider>
          <CodeEditor
            taskId="t1"
            path="a.ts"
            onChange={noop}
            onCursorChange={noop}
            onSave={noop}
            onRun={noop}
          />
          <Marker />
        </EditorProvider>
      </ToastProvider>
    );

    expect(await screen.findByTestId('captured')).toHaveTextContent('matched');
  });

  it('adds two commands: save and run', () => {
    render(<Harness />);

    expect(fakeEditor.addCommand).toHaveBeenCalledTimes(2);
  });

  it('binds Run to Ctrl/Cmd+Enter, not plain Enter', () => {
    render(<Harness />);

    const keybindings = fakeEditor.addCommand.mock.calls.map(
      (call: unknown[]) => call[0] as number
    );

    expect(keybindings).toContain(fakeMonaco.KeyMod.CtrlCmd | fakeMonaco.KeyCode.Enter);

    expect(keybindings).not.toContain(fakeMonaco.KeyCode.Enter);
  });

  it('initializes Monaco with the light theme', () => {
    render(<Harness />);

    expect(screen.getByLabelText('a.ts code editor')).toHaveAttribute('data-theme', 'itp-light');
  });

  it('initializes Monaco with the dark theme when the application is dark', () => {
    setAppTheme('dark');

    render(<Harness />);

    expect(screen.getByLabelText('a.ts code editor')).toHaveAttribute('data-theme', 'itp-dark');
  });

  it('switches Monaco to the dark theme when the application theme changes', async () => {
    render(<Harness />);

    const editor = screen.getByLabelText('a.ts code editor');

    expect(editor).toHaveAttribute('data-theme', 'itp-light');

    setAppTheme('dark');

    await waitFor(() => {
      expect(editor).toHaveAttribute('data-theme', 'itp-dark');
    });
  });

  it('switches Monaco back to the light theme when the application theme changes', async () => {
    setAppTheme('dark');

    render(<Harness />);

    const editor = screen.getByLabelText('a.ts code editor');

    expect(editor).toHaveAttribute('data-theme', 'itp-dark');

    setAppTheme('light');

    await waitFor(() => {
      expect(editor).toHaveAttribute('data-theme', 'itp-light');
    });
  });
});
