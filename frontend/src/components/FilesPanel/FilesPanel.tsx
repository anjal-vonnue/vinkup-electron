import { useState } from 'react';
import { FolderOpen, Plus, RefreshCw, ChevronsDownUp } from 'lucide-react';
import { buildFileTree, type TreeNode } from '../../lib/buildFileTree';
import {
  selectVisiblePaths,
  selectDirtyPaths,
  selectFileCount,
} from '../../pages/TaskPage/state/selectors';
import {
  useWorkspaceState,
  useWorkspaceDispatch,
} from '../../pages/TaskPage/state/WorkspaceContext';
import ConfirmDialog from '../ConfirmDialog';
import FileTree from '../FileTree';
import NewFileInput from '../NewFileInput';
import { planRelocation } from '../../lib/relocatePath';
import styles from './FilesPanel.module.css';

type FilesPanelProps = {
  onRefresh: () => void;
};

export default function FilesPanel({ onRefresh }: FilesPanelProps) {
  const state = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();

  const [isCreating, setIsCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TreeNode | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  const visiblePaths = selectVisiblePaths(state);
  const dirtyPaths = new Set(selectDirtyPaths(state));
  const nodes = buildFileTree(visiblePaths);
  const fileCount = selectFileCount(state);

  const deleteTitle = pendingDelete
    ? pendingDelete.type === 'folder'
      ? `Delete ${pendingDelete.path} and its ${pendingDelete.fileCount} files?`
      : `Delete ${pendingDelete.path}?`
    : '';

  function handleCreate(path: string) {
    dispatch({ type: 'fileCreated', path });
    setIsCreating(false);
  }

  function handleRenameSubmit(node: TreeNode, name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return 'Enter a name.';
    if (trimmed.includes('/')) return "A name can't contain /.";
    const slash = node.path.lastIndexOf('/');
    const target = (slash === -1 ? '' : node.path.slice(0, slash + 1)) + trimmed;

    const plan = planRelocation(visiblePaths, node.path, target);
    if (!plan.ok) return plan.message;
    if (!plan.unchanged) dispatch({ type: 'pathRelocated', from: plan.from, to: plan.to });
    setRenamingPath(null);
    return null;
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;

    if (pendingDelete.type === 'folder') {
      dispatch({ type: 'folderDeleted', path: pendingDelete.path });
    } else {
      dispatch({ type: 'fileDeleted', path: pendingDelete.path });
    }

    setPendingDelete(null);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <FolderOpen size={14} aria-hidden="true" />
        <span className={styles.headerLabel}>WORKSPACE /</span>
        <div className={styles.headerActions}>
          <button type="button" aria-label="New file" onClick={() => setIsCreating(true)}>
            <Plus size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Reload files from server" onClick={onRefresh}>
            <RefreshCw size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Collapse all folders"
            onClick={() => dispatch({ type: 'allFoldersCollapsed' })}
          >
            <ChevronsDownUp size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isCreating && (
        <NewFileInput
          existingPaths={visiblePaths}
          onCreate={handleCreate}
          onCancel={() => setIsCreating(false)}
        />
      )}

      <FileTree
        nodes={nodes}
        activePath={state.activePath}
        dirtyPaths={dirtyPaths}
        expandedFolders={new Set(state.expandedFolders)}
        onOpenFile={(path) => dispatch({ type: 'fileOpened', path })}
        onToggleFolder={(path) => dispatch({ type: 'folderToggled', path })}
        onDelete={setPendingDelete}
        renamingPath={renamingPath}
        onStartRename={(node) => setRenamingPath(node.path)}
        onRenameSubmit={handleRenameSubmit}
        onRenameCancel={() => setRenamingPath(null)}
      />

      <div className={styles.footer}>{fileCount} files</div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={deleteTitle}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      >
        This can&rsquo;t be undone.
      </ConfirmDialog>
    </div>
  );
}
