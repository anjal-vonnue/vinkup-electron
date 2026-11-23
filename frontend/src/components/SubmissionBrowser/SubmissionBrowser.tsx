import { lazy, Suspense, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import type { TaskFile } from '@itp/types';
import { buildFileTree, type TreeNode } from '../../lib/buildFileTree';
import EditorTabs from '../EditorTabs';
import FileTree from '../FileTree';
import MarkdownRenderer from '../MarkdownRenderer';
import styles from './SubmissionBrowser.module.css';
import { closeAllTabs, closeTab, initialTabs, INSTRUCTIONS_TAB, openTab } from './submissionTabs';

// Monaco is heavy: only load it when the mentor opens a code file.
const ReadOnlyCodeViewer = lazy(() => import('../ReadOnlyCodeViewer'));
const NO_DIRTY_PATHS: ReadonlySet<string> = new Set();

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
  const [tabs, setTabs] = useState(initialTabs);
  const activeFile =
    tabs.activePath && tabs.activePath !== INSTRUCTIONS_TAB
      ? files.find((file) => file.path === tabs.activePath)
      : undefined;
  const isInstructionsActive = tabs.activePath === INSTRUCTIONS_TAB;

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
            className={`${styles.instructions} ${isInstructionsActive ? styles.active : ''}`}
            aria-current={isInstructionsActive ? 'true' : undefined}
            onClick={() => setTabs((state) => openTab(state, INSTRUCTIONS_TAB))}
          >
            <FileText aria-hidden="true" />
            INSTRUCTIONS.md
          </button>
          <FileTree
            nodes={nodes}
            activePath={tabs.activePath === INSTRUCTIONS_TAB ? null : tabs.activePath}
            expandedFolders={expanded}
            onOpenFile={(path) => setTabs((state) => openTab(state, path))}
            onToggleFolder={toggleFolder}
          />
        </div>
        <section className={styles.content} aria-label={activeFile?.path ?? 'Submission content'}>
          <div className={styles.tabBar}>
            <EditorTabs
              openPaths={tabs.openPaths}
              activePath={tabs.activePath}
              onActivate={(path) => setTabs((state) => openTab(state, path))}
              onClose={(path) => setTabs((state) => closeTab(state, path))}
              onCloseAll={() => setTabs(closeAllTabs())}
              dirtyPaths={NO_DIRTY_PATHS}
            />
          </div>
          <div className={styles.contentBody}>
            {isInstructionsActive ? (
              instructionsMarkdown.trim() ? (
                <div className={styles.markdown}>
                  <MarkdownRenderer markdown={instructionsMarkdown} />
                </div>
              ) : (
                <p className={styles.status}>No instructions for this task.</p>
              )
            ) : activeFile ? (
              <Suspense fallback={<p className={styles.status}>Loading code…</p>}>
                <ReadOnlyCodeViewer files={[activeFile]} scope={scope} hideTabs />
              </Suspense>
            ) : (
              <p className={styles.status}>Select a file to view</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
