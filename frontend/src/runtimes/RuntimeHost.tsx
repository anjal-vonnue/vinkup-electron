import type { TaskResponse } from '@itp/types';
import BrowserRuntime from './browser/BrowserRuntime';
import LocalBrowserRuntime from './local/LocalBrowserRuntime';
import LocalNodeRuntime from './local/LocalNodeRuntime';
import { isLocalRuntimeEnabled } from './local/localWorkspace';
import NodeRuntime from './node/NodeRuntime';
import SqlRuntime from './sql/SqlRuntime';

type RuntimeHostProps = {
  task: TaskResponse;
  /** The Result pane is shown. It stays mounted while hidden, so runtimes need to know. */
  isVisible: boolean;
};

export default function RuntimeHost({ task, isVisible }: RuntimeHostProps) {
  // The old in-browser stack stays available (web build, tests, VITE_WORKSPACE_RUNTIME=webcontainer).
  const useLocalRuntime = isLocalRuntimeEnabled();

  switch (task.runtime) {
    case 'browser':
      return useLocalRuntime ? (
        <LocalBrowserRuntime task={task} isVisible={isVisible} />
      ) : (
        <BrowserRuntime task={task} isVisible={isVisible} />
      );
    case 'node':
      return useLocalRuntime ? (
        <LocalNodeRuntime task={task} isVisible={isVisible} />
      ) : (
        <NodeRuntime task={task} isVisible={isVisible} />
      );
    case 'sql':
      return <SqlRuntime task={task} isVisible={isVisible} />;
  }
}
