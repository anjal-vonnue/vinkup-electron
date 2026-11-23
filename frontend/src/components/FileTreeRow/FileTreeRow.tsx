import { memo, type MouseEvent } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Trash2,
  FilePlus,
  FolderPlus,
  Pencil,
} from 'lucide-react';
import type { TreeNode } from '../../lib/buildFileTree';
import FileTypeBadge from '../FileTypeBadge';
import InlineRenameInput from './InlineRenameInput';
import styles from './FileTreeRow.module.css';

type FileTreeRowProps = {
  node: TreeNode;
  depth: number;
  isActive: boolean;
  isDirty: boolean;
  isExpanded: boolean;
  tabIndex: number;
  onOpen: () => void;
  onToggle: () => void;
  onDelete?: () => void;
  isRenaming?: boolean;
  onRenameSubmit?: (name: string) => string | null;
  onRenameCancel?: () => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onStartRename?: () => void;
};

function FileTreeRow({
  node,
  depth,
  isActive,
  isDirty,
  isExpanded,
  tabIndex,
  onOpen,
  onToggle,
  onDelete,
  isRenaming,
  onRenameSubmit,
  onRenameCancel,
  onNewFile,
  onNewFolder,
  onStartRename,
}: FileTreeRowProps) {
  const isFolder = node.type === 'folder';

  const nameElement =
    isRenaming && onRenameSubmit && onRenameCancel ? (
      <InlineRenameInput
        initialName={node.name}
        onSubmit={onRenameSubmit}
        onCancel={onRenameCancel}
      />
    ) : (
      <span className={styles.name}>{node.name}</span>
    );
  function handleActivate() {
    if (isFolder) {
      onToggle();
    } else {
      onOpen();
    }
  }

  function stop(action?: () => void) {
    return (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      action?.();
    };
  }
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={isFolder ? isExpanded : undefined}
      aria-selected={!isFolder ? isActive : undefined}
      tabIndex={tabIndex}
      className={isActive ? `${styles.row} ${styles.rowActive}` : styles.row}
      style={{ paddingLeft: 12 + depth * 16 }}
      onClick={handleActivate}
      data-path={node.path}
    >
      {isFolder ? (
        <>
          {isExpanded ? (
            <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />
          ) : (
            <ChevronRight size={14} aria-hidden="true" className={styles.chevron} />
          )}
          <Folder size={14} aria-hidden="true" className={styles.folderIcon} />
          {nameElement}
          <span className={styles.fileCount}>{node.fileCount}</span>
        </>
      ) : (
        <>
          <span className={styles.badgeSlot}>
            <FileTypeBadge path={node.path} />
          </span>
          {nameElement}
          {isDirty && <span className={styles.dirtyDot} aria-label="Unsaved changes" />}
        </>
      )}

      {!isRenaming && (
        <>
          {isFolder && onNewFile && (
            <button
              type="button"
              className={styles.actionButton}
              aria-label={`New file in ${node.name}`}
              title="New file"
              onClick={stop(onNewFile)}
            >
              <FilePlus size={14} aria-hidden="true" />
            </button>
          )}
          {isFolder && onNewFolder && (
            <button
              type="button"
              className={styles.actionButton}
              aria-label={`New folder in ${node.name}`}
              title="New folder"
              onClick={stop(onNewFolder)}
            >
              <FolderPlus size={14} aria-hidden="true" />
            </button>
          )}
          {onStartRename && (
            <button
              type="button"
              className={styles.actionButton}
              aria-label={`Rename ${node.name}`}
              title="Rename (F2)"
              onClick={stop(onStartRename)}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className={`${styles.actionButton} ${styles.deleteButton}`}
              aria-label={`Delete ${node.name}`}
              title="Delete"
              onClick={stop(onDelete)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default memo(FileTreeRow);
