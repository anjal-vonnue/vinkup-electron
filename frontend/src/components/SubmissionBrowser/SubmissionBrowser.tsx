import { lazy, Suspense, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { TaskFile } from '@itp/types';
import { buildFileTree, type TreeNode } from '../../lib/buildFileTree';
import FileTree from '../FileTree';
import MarkdownRenderer from '../MarkdownRenderer';
import styles from './SubmissionBrowser.module.css';

// Monaco is heavy: only load it when the mentor opens a code file.
const ReadOnlyCodeViewer = lazy(() => import('../ReadOnlyCodeViewer'));

type SubmissionBrowserProps = {
  files: TaskFile[];
  instructionsMarkdown: string;
  /** Same scope the read-only viewer already receives, e.g. "traineeId/taskId". */
  scope: string;
};

function collectFolderPaths(nodes: TreeNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (node.type === 'folder') {
      out.push(node.path);
      collectFolderPaths(node.children, out);
    }
  }
  return out;
}

/** Read-only submission view: file tree on the left, INSTRUCTIONS.md or the chosen file on the right. */
export default function SubmissionBrowser({
  files,
  instructionsMarkdown,
  scope,
}: SubmissionBrowserProps) {
  const nodes = useMemo(() => buildFileTree(files.map((file) => file.path)), [files]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(collectFolderPaths(nodes))
  );
  // null means INSTRUCTIONS.md is selected.
  const [activePath, setActivePath] = useState<string | null>(null);
  const activeFile = files.find((file) => file.path === activePath);

  const toggleFolder = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <div className={styles.browser}>
      <div className={styles.layout}>
        <div className={styles.sidebar} role="group" aria-label="Submission files">
          <button
            type="button"
            className={`${styles.instructions} ${activePath === null ? styles.active : ''}`}
            aria-current={activePath === null ? 'true' : undefined}
            onClick={() => setActivePath(null)}
          >
            <FileText aria-hidden="true" />
            INSTRUCTIONS.md
          </button>
          <FileTree
            nodes={nodes}
            activePath={activePath}
            expandedFolders={expanded}
            onOpenFile={setActivePath}
            onToggleFolder={toggleFolder}
          />
        </div>
        <section className={styles.content} aria-label={activeFile?.path ?? 'Instructions'}>
          {activeFile ? (
            <Suspense fallback={<p className={styles.status}>Loading code…</p>}>
              <ReadOnlyCodeViewer files={[activeFile]} scope={scope} />
            </Suspense>
          ) : instructionsMarkdown.trim() ? (
            <div className={styles.markdown}>
              <MarkdownRenderer markdown={instructionsMarkdown} />
            </div>
          ) : (
            <p className={styles.status}>No instructions for this task.</p>
          )}
        </section>
      </div>
    </div>
  );
}
