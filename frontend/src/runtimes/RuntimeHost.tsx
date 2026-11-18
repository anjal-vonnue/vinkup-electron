import type { TaskResponse } from '@itp/types';
import LocalBrowserRuntime from './local/LocalBrowserRuntime';
import LocalNodeRuntime from './local/LocalNodeRuntime';
import SqlRuntime from './sql/SqlRuntime';

type RuntimeHostProps = {
  task: TaskResponse;
  /** The Result pane is shown. It stays mounted while hidden, so runtimes need to know. */
  isVisible: boolean;
};

export default function RuntimeHost({ task, isVisible }: RuntimeHostProps) {
  switch (task.runtime) {
    case 'browser':
      return <LocalBrowserRuntime task={task} isVisible={isVisible} />;
    case 'node':
      return <LocalNodeRuntime task={task} isVisible={isVisible} />;
    case 'sql':
      return <SqlRuntime task={task} isVisible={isVisible} />;
  }
}
