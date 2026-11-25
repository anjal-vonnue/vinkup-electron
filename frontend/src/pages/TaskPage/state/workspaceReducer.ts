import type { WorkspaceAction, WorkspaceState } from '../../../types/workspaceTypes';
import { expandParents } from './workspaceUtils';
import { rewritePath } from '../../../lib/relocatePath';

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'serverFilesLoaded': {
      const files = Object.fromEntries(action.code.files.map((file) => [file.path, file.content]));
      const savedFiles = { ...files };
      const openPaths = state.openPaths.filter((path) => path in files);
      const activePath =
        state.activePath && state.activePath in files ? state.activePath : (openPaths[0] ?? null);

      return {
        ...state,
        files,
        savedFiles,
        openPaths,
        activePath,
        serverVersion: state.serverVersion + 1,
      };
    }

    case 'fileOpened': {
      if (!(action.path in state.files)) return state;
      if (state.openPaths.includes(action.path)) {
        return { ...state, activePath: action.path };
      }

      const activeIndex = state.activePath ? state.openPaths.indexOf(state.activePath) : -1;
      const insertAt = activeIndex === -1 ? state.openPaths.length : activeIndex + 1;
      const openPaths = [
        ...state.openPaths.slice(0, insertAt),
        action.path,
        ...state.openPaths.slice(insertAt),
      ];

      return {
        ...state,
        openPaths,
        activePath: action.path,
        expandedFolders: expandParents(state.expandedFolders, action.path),
      };
    }

    case 'tabActivated':
      return state.openPaths.includes(action.path) ? { ...state, activePath: action.path } : state;

    case 'tabClosed': {
      if (!state.openPaths.includes(action.path)) return state;
      const index = state.openPaths.indexOf(action.path);
      const openPaths = state.openPaths.filter((path) => path !== action.path);

      const activePath =
        state.activePath === action.path
          ? (openPaths[index] ?? openPaths[index - 1] ?? null)
          : state.activePath;

      return { ...state, openPaths, activePath };
    }

    case 'allTabsClosed':
      return { ...state, openPaths: [], activePath: null };

    case 'fileEdited': {
      if (!(action.path in state.files)) return state;
      if (state.files[action.path] === action.content) return state;
      return { ...state, files: { ...state.files, [action.path]: action.content } };
    }

    case 'saveSucceeded':
      return { ...state, savedFiles: action.snapshot };

    case 'fileCreated': {
      if (action.path in state.files) return state;
      const withFile = { ...state, files: { ...state.files, [action.path]: action.content ?? '' } };
      return action.open === false
        ? withFile
        : workspaceReducer(withFile, { type: 'fileOpened', path: action.path });
    }

    case 'fileDeleted': {
      if (!(action.path in state.files)) return state;
      const files = Object.fromEntries(
        Object.entries(state.files).filter(([path]) => path !== action.path)
      );
      const afterClose = workspaceReducer(state, { type: 'tabClosed', path: action.path });
      return { ...afterClose, files };
    }

    case 'folderDeleted': {
      const prefix = `${action.path}/`;
      return Object.keys(state.files)
        .filter((path) => path.startsWith(prefix))
        .reduce((next, path) => workspaceReducer(next, { type: 'fileDeleted', path }), state);
    }

    case 'pathRelocated': {
      const { from, to } = action;
      if (from === to) return state;

      const entries = Object.entries(state.files).map(
        ([path, content]) => [rewritePath(path, from, to), content] as const
      );
      // Two files landing on one path would silently drop one: refuse instead.
      if (new Set(entries.map(([path]) => path)).size !== entries.length) return state;

      // The destination's parent folders stay open so the moved item is visible.
      const parentSegments = to.split('/').slice(0, -1);
      const parents = parentSegments.map((_, index) =>
        parentSegments.slice(0, index + 1).join('/')
      );

      return {
        ...state,
        files: Object.fromEntries(entries),
        // savedFiles is left alone on purpose: the new path then counts as unsaved and the old
        // one as deleted, so the next save stores the rename.
        openPaths: state.openPaths.map((path) => rewritePath(path, from, to)),
        activePath: state.activePath === null ? null : rewritePath(state.activePath, from, to),
        expandedFolders: [
          ...new Set([
            ...state.expandedFolders.map((path) => rewritePath(path, from, to)),
            ...parents,
          ]),
        ],
      };
    }

    case 'folderToggled': {
      const isExpanded = state.expandedFolders.includes(action.path);
      return {
        ...state,
        expandedFolders: isExpanded
          ? state.expandedFolders.filter((path) => path !== action.path)
          : [...state.expandedFolders, action.path],
      };
    }

    case 'allFoldersCollapsed':
      return { ...state, expandedFolders: [] };

    case 'paneToggled': {
      const next = { ...state.visiblePanes, [action.pane]: !state.visiblePanes[action.pane] };
      return Object.values(next).some(Boolean) ? { ...state, visiblePanes: next } : state;
    }

    case 'panesSet':
      return Object.values(action.visiblePanes).some(Boolean)
        ? { ...state, visiblePanes: action.visiblePanes }
        : state;

    case 'sidebarTabChanged':
      return {
        ...state,
        sidebarTab: action.tab,
        visiblePanes: { ...state.visiblePanes, sidebar: true },
      };

    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }
}
