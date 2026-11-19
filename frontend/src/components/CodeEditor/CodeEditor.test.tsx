// @vitest-environment jsdom

import { useEffect, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { EditorProvider, useEditorRef } from '../../pages/TaskPage/state/EditorContext';
import { ToastProvider } from '../../components/Toast';
import { fakeEditor, fakeMonaco } from '../../test/setup';
import CodeEditor from './CodeEditor';

const noop = () => {};

type HarnessProps = {
  path?: string;
  onChange?: (path: string, content: string) => void;
};

function Harness({ path = 'a.ts', onChange = noop }: HarnessProps) {
  return (
    <ToastProvider>
      <EditorProvider>
        <CodeEditor
          taskId="t1"
          path={path}
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

/** What the fake editor's current model contains. Pass null for "no model". */
function setModel(text: string | null, uriPath = '/notes.md') {
  vi.mocked(fakeEditor.getModel).mockReturnValue(
    text === null ? null : ({ uri: { path: uriPath }, getValue: () => text } as never)
  );
}

/** The callback the component registered with one of the editor's `onDid...` methods. */
function listenerOf(register: unknown): () => void {
  const calls = (register as { mock: { calls: Array<[() => void]> } }).mock.calls;
  const callback = calls.at(-1)?.[0];

  if (!callback) throw new Error('The editor never registered that listener.');

  return callback;
}

/**
 * The editor is hidden with a CSS-module class (jsdom does not apply the stylesheet, so
 * `toBeVisible` cannot be used). The class name is matched loosely because CSS modules may
 * hash it.
 */
function isEditorHidden(label: string): boolean {
  return screen.getByLabelText(label).closest('[class*="editorHidden"]') !== null;
}

const NOTES_PATH = 'notes.md';
const NOTES_LABEL = 'notes.md code editor';

const scrollIntoView = vi.fn();

describe('CodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppTheme('light');

    // clearAllMocks keeps implementations, so put the model back to a known state.
    setModel(null);

    // jsdom does not implement scrollIntoView.
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
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

  it('clears the editor context when the editor is disposed', () => {
    let captured: ReturnType<typeof useEditorRef> | null = null;

    function Probe() {
      const editorRef = useEditorRef();

      useEffect(() => {
        captured = editorRef;
      }, [editorRef]);

      return null;
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
          <Probe />
        </EditorProvider>
      </ToastProvider>
    );

    expect(captured!.current).toBe(fakeEditor);

    act(() => listenerOf(fakeEditor.onDidDispose)());

    expect(captured!.current).toBeNull();
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

  it('does not show the Markdown toolbar for other file types', () => {
    render(<Harness />);

    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Split' })).not.toBeInTheDocument();
  });
});

describe('CodeEditor Markdown view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppTheme('light');
    setModel(null);
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it('shows Edit, Preview and Split for a Markdown file, starting on Edit', () => {
    render(<Harness path={NOTES_PATH} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'false');
    expect(isEditorHidden(NOTES_LABEL)).toBe(false);
  });

  it('renders the file as Markdown in Preview', async () => {
    const user = userEvent.setup();
    setModel('# Title\n\nSome **bold** text');

    render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    // The heading's accessible name also contains the permalink's label.
    expect(screen.getByRole('heading', { level: 1, name: /Title/ })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the same editor mounted, only hidden, while previewing', async () => {
    const user = userEvent.setup();
    setModel('# Title');

    render(<Harness path={NOTES_PATH} />);

    const editor = screen.getByLabelText(NOTES_LABEL);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    // Unmounting Monaco disposes the file's model, which is what emptied the editor before.
    expect(isEditorHidden(NOTES_LABEL)).toBe(true);
    expect(screen.getByLabelText(NOTES_LABEL)).toBe(editor);

    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(isEditorHidden(NOTES_LABEL)).toBe(false);
    expect(screen.getByLabelText(NOTES_LABEL)).toBe(editor);

    // Mounted once: the commands were registered once, not again on every switch.
    expect(fakeEditor.addCommand).toHaveBeenCalledTimes(2);
  });

  it('keeps the preview text when the editor reports no model', async () => {
    const user = userEvent.setup();
    setModel('# Title');

    render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    // This is what Monaco does while it is torn down; it used to blank the preview.
    setModel(null);
    act(() => listenerOf(fakeEditor.onDidChangeModel)());

    expect(screen.getByRole('heading', { level: 1, name: /Title/ })).toBeInTheDocument();
    expect(screen.queryByText('Nothing to preview.')).not.toBeInTheDocument();
  });

  it('shows the editor and the preview together in Split', async () => {
    const user = userEvent.setup();
    setModel('# Title');

    render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Split' }));

    expect(isEditorHidden(NOTES_LABEL)).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: /Title/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Split' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('updates the preview as the editor content changes', async () => {
    const user = userEvent.setup();
    setModel('# First');

    render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Split' }));

    expect(screen.getByRole('heading', { level: 1, name: /First/ })).toBeInTheDocument();

    setModel('# Second');
    act(() => listenerOf(fakeEditor.onDidChangeModelContent)());

    expect(await screen.findByRole('heading', { level: 1, name: /Second/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /First/ })).not.toBeInTheDocument();
  });

  it('says there is nothing to preview for an empty file', async () => {
    const user = userEvent.setup();
    setModel('');

    render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(screen.getByText('Nothing to preview.')).toBeInTheDocument();
  });

  it('goes back to Edit when a different file is opened', async () => {
    const user = userEvent.setup();
    setModel('# Title');

    const { rerender } = render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    rerender(<Harness path="a.ts" />);

    expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
    expect(isEditorHidden('a.ts code editor')).toBe(false);

    rerender(<Harness path={NOTES_PATH} />);

    expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-pressed', 'true');
    expect(isEditorHidden(NOTES_LABEL)).toBe(false);
  });
});

describe('CodeEditor Markdown preview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAppTheme('light');
    setModel(null);
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  async function previewOf(markdown: string) {
    const user = userEvent.setup();
    setModel(markdown);

    render(<Harness path={NOTES_PATH} />);

    await user.click(screen.getByRole('button', { name: 'Preview' }));

    return user;
  }

  it('renders GitHub-flavoured Markdown: tables, task lists and highlighted code', async () => {
    await previewOf(
      [
        '| name | role |',
        '| ---- | ---- |',
        '| Ada  | dev  |',
        '',
        '- [x] done',
        '- [ ] todo',
        '',
        '```js',
        'const answer = 42;',
        '```',
      ].join('\n')
    );

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Ada' })).toBeInTheDocument();

    const [done, todo] = screen.getAllByRole('checkbox');

    expect(done).toBeChecked();
    expect(done).toBeDisabled();
    expect(todo).not.toBeChecked();

    // rehype-highlight wraps the keyword in a token span.
    expect(screen.getByText('const')).toHaveClass('hljs-keyword');
  });

  it('removes scripts and event handlers from inline HTML', async () => {
    await previewOf('hello\n\n<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">');

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.queryByText(/alert\(1\)/)).not.toBeInTheDocument();

    // With an empty alt the image has the "presentation" role.
    const image = screen.getByRole('presentation');

    expect(image).not.toHaveAttribute('onerror');
  });

  it('opens web links in a new tab without giving the page access to the app', async () => {
    await previewOf('[docs](https://example.com)');

    const link = screen.getByRole('link', { name: 'docs' });

    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('does not let a relative link navigate the app', async () => {
    await previewOf('[other file](./other.md)');

    const link = screen.getByRole('link', { name: 'other file' });

    // fireEvent returns false when the click's default action was prevented.
    expect(fireEvent.click(link)).toBe(false);
  });

  it('scrolls to a heading for #links without changing the page address', async () => {
    await previewOf('# Intro\n\nText\n\n[go to intro](#intro)');

    const link = screen.getByRole('link', { name: 'go to intro' });

    expect(fireEvent.click(link)).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('gives headings a permalink that scrolls to them', async () => {
    await previewOf('## Section');

    const permalink = screen.getByRole('link', { name: 'Permalink' });

    expect(fireEvent.click(permalink)).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
