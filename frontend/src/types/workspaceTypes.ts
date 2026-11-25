export type PaneId = 'sidebar' | 'code' | 'result';
export type SidebarTab = 'instructions' | 'files';

export type WorkspaceState = {
  files: Record<string, string>; // path → current content
  savedFiles: Record<string, string>; // path → content the server last confirmed
  openPaths: string[]; // editor tabs, in display order
  activePath: string | null;
  expandedFolders: string[]; // e.g. ['assets']
  visiblePanes: Record<PaneId, boolean>;
  sidebarTab: SidebarTab;
  serverVersion: number; // +1 on serverFilesLoaded; used to remount the editor later (TK-4)
};

export type WorkspaceAction =
  | { type: 'serverFilesLoaded'; code: { files: { path: string; content: string }[] } }
  | { type: 'fileOpened'; path: string }
  | { type: 'tabActivated'; path: string }
  | { type: 'tabClosed'; path: string }
  | { type: 'allTabsClosed' }
  | { type: 'fileEdited'; path: string; content: string }
  | { type: 'saveSucceeded'; snapshot: Record<string, string> }
  | { type: 'folderToggled'; path: string }
  | { type: 'allFoldersCollapsed' }
  | { type: 'paneToggled'; pane: PaneId }
  | { type: 'panesSet'; visiblePanes: Record<PaneId, boolean> }
  | { type: 'sidebarTabChanged'; tab: SidebarTab }
  /** open: false is used by the Node runtime when a file appears from the terminal (FE-08) */
  | { type: 'fileCreated'; path: string; content?: string; open?: boolean }
  | { type: 'fileDeleted'; path: string }
  | { type: 'folderDeleted'; path: string }
  /** Rename or move a file, or a whole folder: `from` becomes `to`. Validate with planRelocation first. */
  | { type: 'pathRelocated'; from: string; to: string };
