import { useRef, useState, type KeyboardEvent } from 'react';
import type { TreeNode } from '../../lib/buildFileTree';
import FileTreeRow from '../FileTreeRow';
import styles from './FileTree.module.css';

type FileTreeProps = {
  nodes: TreeNode[];
  activePath: string | null;
  dirtyPaths?: ReadonlySet<string>;
  expandedFolders: ReadonlySet<string>;
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onDelete?: (node: TreeNode) => void;
  renamingPath?: string | null;
  onStartRename?: (node: TreeNode) => void;
  onRenameSubmit?: (node: TreeNode, name: string) => string | null;
  onRenameCancel?: () => void;
};

type FlatRow = { node: TreeNode; depth: number };

function flatten(
  nodes: TreeNode[],
  expandedFolders: ReadonlySet<string>,
  depth: number
): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.type === 'folder' && expandedFolders.has(node.path)) {
      rows.push(...flatten(node.children, expandedFolders, depth + 1));
    }
  }
  return rows;
}

function parentPathOf(path: string): string | null {
  const slashIndex = path.lastIndexOf('/');
  return slashIndex === -1 ? null : path.slice(0, slashIndex);
}

export default function FileTree({
  nodes,
  activePath,
  dirtyPaths = new Set(),
  expandedFolders,
  onOpenFile,
  onToggleFolder,
  onDelete,
  renamingPath,
  onStartRename,
  onRenameSubmit,
  onRenameCancel,
}: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rows = flatten(nodes, expandedFolders, 0);

  const [requestedFocusPath, setFocusedPath] = useState<string | null>(null);

  // Derived, not stored: if the requested (or active) row isn't visible any more
  // (a folder collapsed, a file was deleted), fall back to the first row instead
  // of tracking that with a separate effect + setState.
  const focusedPath =
    (requestedFocusPath && rows.some((row) => row.node.path === requestedFocusPath)
      ? requestedFocusPath
      : null) ??
    (rows.some((row) => row.node.path === activePath) ? activePath : null) ??
    rows[0]?.node.path ??
    null;

  function focusRow(path: string | null) {
    if (!path) return;
    setFocusedPath(path);
    const el = containerRef.current?.querySelector<HTMLElement>(`[data-path="${cssEscape(path)}"]`);
    el?.focus();
  }

  function cssEscape(value: string): string {
    return value.replace(/["\\]/g, '\\$&');
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    const path = target?.dataset.path;
    const index = rows.findIndex((row) => row.node.path === path);
    const row = rows[index];
    if (!row) return;

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = rows[index + 1];
        if (next) focusRow(next.node.path);
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const previous = rows[index - 1];
        if (previous) focusRow(previous.node.path);
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (row.node.type === 'folder') {
          if (!expandedFolders.has(row.node.path)) {
            onToggleFolder(row.node.path);
          } else {
            const next = rows[index + 1];
            if (next) focusRow(next.node.path);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (row.node.type === 'folder' && expandedFolders.has(row.node.path)) {
          onToggleFolder(row.node.path);
        } else {
          const parentPath = parentPathOf(row.node.path);
          if (parentPath) focusRow(parentPath);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        if (row.node.type === 'folder') {
          onToggleFolder(row.node.path);
        } else {
          onOpenFile(row.node.path);
        }
        break;
      }
      case 'Delete':
      case 'Backspace': {
        if (!onDelete) break;
        event.preventDefault();
        onDelete(row.node);
        break;
      }
      case 'Home': {
        event.preventDefault();
        if (rows[0]) focusRow(rows[0].node.path);
        break;
      }
      case 'End': {
        event.preventDefault();
        const last = rows[rows.length - 1];
        if (last) focusRow(last.node.path);
        break;
      }
      case 'F2': {
        if (!onStartRename) break;
        event.preventDefault();
        onStartRename(row.node);
        break;
      }
      default:
        break;
    }
  }

  return (
    <div
      role="tree"
      aria-label="Files"
      className={styles.tree}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {rows.map((row) => (
        <FileTreeRow
          key={row.node.path}
          node={row.node}
          depth={row.depth}
          isActive={row.node.path === activePath}
          isDirty={dirtyPaths.has(row.node.path)}
          isExpanded={row.node.type === 'folder' && expandedFolders.has(row.node.path)}
          tabIndex={row.node.path === focusedPath ? 0 : -1}
          onOpen={() => {
            setFocusedPath(row.node.path);
            onOpenFile(row.node.path);
          }}
          onToggle={() => {
            setFocusedPath(row.node.path);
            onToggleFolder(row.node.path);
          }}
          onDelete={onDelete ? () => onDelete(row.node) : undefined}
          isRenaming={row.node.path === renamingPath}
          onRenameSubmit={
            row.node.path === renamingPath && onRenameSubmit
              ? (name) => onRenameSubmit(row.node, name)
              : undefined
          }
          onRenameCancel={row.node.path === renamingPath ? onRenameCancel : undefined}
        />
      ))}
    </div>
  );
}
