import { useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import '../../lib/monacoSetup';
import { toModelUri } from '../../lib/monacoConfig';
import { useEditorRef } from '../../pages/TaskPage/state/EditorContext';
import { useBlockedPasteReporter } from '../../pages/TaskPage/hooks/useBlockedPasteReporter';
import { usePasteBlock } from '../../pages/TaskPage/hooks/usePasteBlock';
import styles from './CodeEditor.module.css';

type CodeEditorProps = {
  taskId: string;
  path: string;
  onChange: (path: string, content: string) => void;
  onCursorChange: (line: number, column: number) => void;
  onSave: () => void;
  onRun: () => void;
};

/**
 * Reads the application's current theme and listens for theme changes.
 */
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

  const reportBlockedPaste = useBlockedPasteReporter(taskId, 'editor');

  usePasteBlock({
    editor: editorInstance,
    container,
    onBlocked: reportBlockedPaste,
  });

  function handleMount(
    instance: editor.IStandaloneCodeEditor,
    monaco: typeof import('monaco-editor')
  ) {
    editorRef.current = instance;
    setEditorInstance(instance);

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current());

    instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());

    instance.onDidChangeCursorPosition((event) => {
      onCursorChangeRef.current(event.position.lineNumber, event.position.column);
    });

    instance.focus();
  }

  return (
    <div ref={setContainer} className={styles.container}>
      <Editor
        path={toModelUri(path)}
        theme={isDark ? 'itp-dark' : 'itp-light'}
        onMount={handleMount}
        onChange={(value) => onChangeRef.current(path, value ?? '')}
        loading={<></>}
        options={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 14,
          lineHeight: 22,
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
  );
}
