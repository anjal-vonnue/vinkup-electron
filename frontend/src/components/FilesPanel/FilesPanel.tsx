import { useState, useContext } from 'react';
import { ToastContext } from '../Toast';
import { FolderOpen, FilePlus, FolderPlus, RefreshCw, ChevronsDownUp } from 'lucide-react';
import { buildFileTree, type TreeNode } from '../../lib/buildFileTree';
import NewFolderInput from '../NewFolderInput';
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

type Creating = { kind: 'file' | 'folder'; parent: string };

export default function FilesPanel({ onRefresh }: FilesPanelProps) {
  const state = useWorkspaceState();
  const dispatch = useWorkspaceDispatch();

  const [creating, setCreating] = useState<Creating | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TreeNode | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string } | null>(null);

  const toastContext = useContext(ToastContext);
  const showToast = toastContext?.show ?? (() => {});

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
    setCreating(null);
  }

  // A folder exists once it holds a file, so naming a folder leads straight to its first file.
  function handleFolderNamed(path: string) {
    setCreating({ kind: 'file', parent: path });
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

  function handleMove(fromPath: string, targetFolder: string) {
    const name = fromPath.slice(fromPath.lastIndexOf('/') + 1);
    const target = targetFolder ? `${targetFolder}/${name}` : name;

    const plan = planRelocation(visiblePaths, fromPath, target);
    if (!plan.ok) {
      showToast({ message: plan.message, variant: 'error' });
      return;
    }
    if (plan.unchanged) return; // dropped where it already is
    setPendingMove({ from: plan.from, to: plan.to });
  }

  function handleConfirmMove() {
    if (!pendingMove) return;
    dispatch({ type: 'pathRelocated', from: pendingMove.from, to: pendingMove.to });
    setPendingMove(null);
  }

  const moveName = pendingMove ? pendingMove.from.slice(pendingMove.from.lastIndexOf('/') + 1) : '';
  const moveDestination =
    pendingMove && pendingMove.to.includes('/')
      ? pendingMove.to.slice(0, pendingMove.to.lastIndexOf('/'))
      : 'the top level';

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <FolderOpen size={14} aria-hidden="true" />
        <span className={styles.headerLabel}>WORKSPACE /</span>
        <div className={styles.headerActions}>
          <button
            type="button"
            aria-label="New file"
            title="New file"
            onClick={() => setCreating({ kind: 'file', parent: '' })}
          >
            <FilePlus size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="New folder"
            title="New folder"
            onClick={() => setCreating({ kind: 'folder', parent: '' })}
          >
            <FolderPlus size={14} aria-hidden="true" />
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

      {creating?.kind === 'file' && (
        <NewFileInput
          key={creating.parent}
          existingPaths={visiblePaths}
          initialValue={creating.parent ? `${creating.parent}/` : ''}
          onCreate={handleCreate}
          onCancel={() => setCreating(null)}
        />
      )}
      {creating?.kind === 'folder' && (
        <NewFolderInput
          key={creating.parent}
          existingPaths={visiblePaths}
          initialValue={creating.parent ? `${creating.parent}/` : ''}
          onSubmit={handleFolderNamed}
          onCancel={() => setCreating(null)}
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
        onNewFile={(node) => setCreating({ kind: 'file', parent: node.path })}
        onNewFolder={(node) => setCreating({ kind: 'folder', parent: node.path })}
        onMove={handleMove}
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

      <ConfirmDialog
        open={pendingMove !== null}
        title={`Move ${moveName} into ${moveDestination}?`}
        confirmLabel="Move"
        onConfirm={handleConfirmMove}
        onCancel={() => setPendingMove(null)}
      >
        Open tabs and unsaved changes move with it.
      </ConfirmDialog>
    </div>
  );
}
