import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Eye, Columns2, Code2 } from 'lucide-react';

import '../../lib/monacoSetup';
import { toModelUri } from '../../lib/monacoConfig';
import { useEditorRef } from '../../pages/TaskPage/state/EditorContext';
import { useBlockedPasteReporter } from '../../pages/TaskPage/hooks/useBlockedPasteReporter';
import { usePasteBlock } from '../../pages/TaskPage/hooks/usePasteBlock';
import MarkdownPreview from '../MarkdownPreview';
import styles from './CodeEditor.module.css';

type CodeEditorProps = {
  taskId: string;
  path: string;
  onChange: (path: string, content: string) => void;
  onCursorChange: (line: number, column: number) => void;
  onSave: () => void;
  onRun: () => void;
};

type MarkdownViewMode = 'edit' | 'preview' | 'split';

const MARKDOWN_PATH = /\.(md|markdown)$/i;

function useAppTheme(): boolean {
  const [isDark, setIsDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.dataset.theme === 'dark');
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
}

export default function CodeEditor({
  taskId,
  path,
  onChange,
  onCursorChange,
  onSave,
  onRun,
}: CodeEditorProps) {
  const editorRef = useEditorRef();
  const isDark = useAppTheme();

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);

  // A copy of the open Markdown file's text, for the preview. The editor's model stays the
  // single source of truth; this is only refreshed from it.
  const [markdownContent, setMarkdownContent] = useState('');
  const [viewState, setViewState] = useState({
    path,
    mode: 'edit' as MarkdownViewMode,
  });
  const isMarkdown = MARKDOWN_PATH.test(path);

  const onChangeRef = useRef(onChange);
  const onCursorChangeRef = useRef(onCursorChange);
  const onSaveRef = useRef(onSave);
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onChangeRef.current = onChange;
    onCursorChangeRef.current = onCursorChange;
    onSaveRef.current = onSave;
    onRunRef.current = onRun;
  });

  if (viewState.path !== path) {
    setViewState({
      path,
      mode: 'edit',
    });
  }

  const viewMode = viewState.mode;
  const showEditor = !isMarkdown || viewMode !== 'preview';
  const showPreview = isMarkdown && viewMode !== 'edit';

  const setViewMode = (mode: MarkdownViewMode) => {
    setViewState({ path, mode });
  };

  // Monaco may need to re-measure itself after it has been hidden and shown again.
  useEffect(() => {
    if (!container || !editorInstance) return;

    const observer = new ResizeObserver(() => {
      editorInstance.layout();
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [container, editorInstance]);

  useEffect(() => {
    if (!editorInstance || !showEditor) return;

    const frame = requestAnimationFrame(() => editorInstance.layout());

    return () => cancelAnimationFrame(frame);
  }, [editorInstance, showEditor, viewMode]);

  const reportBlockedPaste = useBlockedPasteReporter(taskId, 'editor');

  usePasteBlock({
    editor: editorInstance,
    container,
    onBlocked: reportBlockedPaste,
  });

  function syncMarkdown(instance: editor.IStandaloneCodeEditor) {
    const model = instance.getModel();

    // No model means the editor is being torn down: keep the text we already have
    // instead of replacing it with an empty string.
    if (!model || !MARKDOWN_PATH.test(model.uri.path)) return;

    setMarkdownContent(model.getValue());
  }

  function handleMount(
    instance: editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor')
  ) {
    editorRef.current = instance;
    setEditorInstance(instance);
    syncMarkdown(instance);

    instance.onDidChangeModel(() => syncMarkdown(instance));
    instance.onDidChangeModelContent(() => syncMarkdown(instance));

    // Do not leave a disposed editor behind in the shared ref or in state.
    instance.onDidDispose(() => {
      if (editorRef.current === instance) editorRef.current = null;
      setEditorInstance((current) => (current === instance ? null : current));
    });

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current());

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());

    instance.onDidChangeCursorPosition((event) => {
      onCursorChangeRef.current(event.position.lineNumber, event.position.column);
    });

    instance.focus();
  }

  function handleChange(value: string) {
    onChangeRef.current(path, value);
  }

  return (
    <div ref={setContainer} className={styles.container}>
      {isMarkdown && (
        <div className={styles.markdownToolbar}>
          <div className={styles.viewActions}>
            <button
              type="button"
              className={viewMode === 'edit' ? styles.activeView : ''}
              onClick={() => setViewMode('edit')}
              aria-pressed={viewMode === 'edit'}
            >
              <Code2 size={14} aria-hidden="true" />
              Edit
            </button>

            <button
              type="button"
              className={viewMode === 'preview' ? styles.activeView : ''}
              onClick={() => setViewMode('preview')}
              aria-pressed={viewMode === 'preview'}
            >
              <Eye size={14} aria-hidden="true" />
              Preview
            </button>

            <button
              type="button"
              className={viewMode === 'split' ? styles.activeView : ''}
              onClick={() => setViewMode('split')}
              aria-pressed={viewMode === 'split'}
            >
              <Columns2 size={14} aria-hidden="true" />
              Split
            </button>
          </div>

          <span className={styles.markdownLabel}>Markdown</span>
        </div>
      )}

      <div
        className={`${styles.workspace} ${isMarkdown && viewMode === 'split' ? styles.split : ''}`}
      >
        {/*
          Always mounted, only hidden in Preview. Unmounting @monaco-editor/react disposes the
          model, which throws away the file's text (and its undo history) and leaves the editor
          empty when it is shown again.
        */}
        <div
          className={
            showEditor ? styles.editorSurface : `${styles.editorSurface} ${styles.editorHidden}`
          }
        >
          <Editor
            path={toModelUri(path)}
            theme={isDark ? 'itp-dark' : 'itp-light'}
            onMount={handleMount}
            onChange={(value) => handleChange(value ?? '')}
            loading={<></>}
            options={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              lineHeight: 22,
              wordWrap: 'on',
              wrappingStrategy: 'advanced',
              lineNumbers: (lineNumber: number) => String(lineNumber).padStart(2, '0'),
              minimap: { enabled: false },
              tabSize: 2,
              insertSpaces: true,
              detectIndentation: false,
              renderLineHighlight: 'line',
              dragAndDrop: false,
              contextmenu: false,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              fixedOverflowWidgets: true,
              ariaLabel: `${path} code editor`,
            }}
          />
        </div>

        {showPreview && (
          <div className={styles.preview}>
            <MarkdownPreview source={markdownContent} />
          </div>
        )}
      </div>
    </div>
  );
}
