import { useState } from 'react';
import type { CheckpointWorkspaceFile } from '@itp/types';
import { FileCode2 } from 'lucide-react';
import styles from './WorkspaceFilesViewer.module.css';

type WorkspaceFilesViewerProps = {
  files: CheckpointWorkspaceFile[] | null;
  emptyLabel?: string;
};

/** Read-only view of a practical answer, used while locked and on result pages. */
export default function WorkspaceFilesViewer({
  files,
  emptyLabel = 'No workspace files were saved.',
}: WorkspaceFilesViewerProps) {
  const list = files ?? [];
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  if (list.length === 0) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }

  const active = list.find((file) => file.path === selectedPath) ?? list[0];

  return (
    <div className={styles.viewer}>
      <div className={styles.fileList} role="tablist" aria-label="Workspace files">
        {list.map((file) => (
          <button
            key={file.path}
            type="button"
            role="tab"
            aria-selected={file.path === active.path}
            className={`${styles.fileButton} ${
              file.path === active.path ? styles.fileButtonActive : ''
            }`}
            onClick={() => setSelectedPath(file.path)}
          >
            <FileCode2 size={14} aria-hidden="true" />
            <span>{file.path}</span>
          </button>
        ))}
      </div>
      <div className={styles.codeArea}>
        <div className={styles.codeHeader}>{active.path}</div>
        <pre className={styles.code}>{active.content || '(empty file)'}</pre>
      </div>
    </div>
  );
}
