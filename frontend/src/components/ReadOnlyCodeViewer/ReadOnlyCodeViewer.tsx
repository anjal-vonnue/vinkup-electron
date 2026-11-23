import { useState } from 'react';
import Editor from '@monaco-editor/react';
import type { TaskFile } from '@itp/types';
import { applyViewerSettings } from '../../lib/monacoSetup';
import { getFileType } from '../../lib/fileTypes';
import { usePrefersDark } from '../../hooks/usePrefersDark';
import FileTypeBadge from '../FileTypeBadge';
import styles from './ReadOnlyCodeViewer.module.css';

type ReadOnlyCodeViewerProps = {
  files: TaskFile[];
  /** Keeps this viewer's editor models apart from the trainee workspace's, e.g. "traineeId/taskId". */
  scope: string;
  hideTabs?: boolean;
};

/**
 * Shows a trainee's files and nothing else: no editing, no running, no saving, and none of the
 * paste-block or focus-tracking hooks the trainee editor uses (they would log flags).
 * Give it a `key` per task so it starts on the first file again.
 */
export default function ReadOnlyCodeViewer({
  files,
  scope,
  hideTabs = false,
}: ReadOnlyCodeViewerProps) {
  const isDark = usePrefersDark();
  const [activePath, setActivePath] = useState(files[0]?.path ?? null);

  if (files.length === 0) {
    return <p className={styles.empty}>This task has no files.</p>;
  }

  const activeFile = files.find((file) => file.path === activePath) ?? files[0];
  const fileType = getFileType(activeFile.path);

  return (
    <div className={styles.viewer}>
      {!hideTabs && (
        <div className={styles.tabs} role="tablist" aria-label="Files">
          {files.map((file) => {
            const isActive = file.path === activeFile.path;
            return (
              <button
                key={file.path}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                onClick={() => setActivePath(file.path)}
              >
                <FileTypeBadge path={file.path} />
                {file.path}
              </button>
            );
          })}
        </div>
      )}

      {fileType.isText ? (
        <div className={styles.editor}>
          <Editor
            path={`file:///admin-view/${scope}/${activeFile.path}`}
            language={fileType.monacoLanguage}
            value={activeFile.content}
            theme={isDark ? 'itp-dark' : 'itp-light'}
            beforeMount={applyViewerSettings}
            loading={<></>}
            options={{
              readOnly: true,
              domReadOnly: true,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              lineHeight: 22,
              lineNumbers: (lineNumber: number) => String(lineNumber).padStart(2, '0'),
              minimap: { enabled: false },
              contextmenu: false,
              automaticLayout: true,
              scrollBeyondLastLine: false,
              padding: { top: 16, bottom: 16 },
              renderLineHighlight: 'none',
              ariaLabel: `${activeFile.path} (read-only)`,
            }}
          />
        </div>
      ) : (
        <p className={styles.empty}>Images can&rsquo;t be previewed here.</p>
      )}

      <div className={styles.statusBar}>
        <span>{fileType.isText ? fileType.label : 'Image'}</span>
        <span className={styles.readOnly}>Read only</span>
      </div>
    </div>
  );
}
