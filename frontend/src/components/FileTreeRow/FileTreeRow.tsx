import { memo, type MouseEvent } from 'react';
import { ChevronRight, ChevronDown, Folder, Trash2 } from 'lucide-react';
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

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (onDelete) onDelete();
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

      {onDelete && !isRenaming && (
        <button
          type="button"
          className={styles.deleteButton}
          aria-label={`Delete ${node.name}`}
          onClick={handleDeleteClick}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default memo(FileTreeRow);
