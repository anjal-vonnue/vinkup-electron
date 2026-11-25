/** Key for the instructions tab. Contains a space, which validateFileName forbids, so it can never equal a real file path. */
export const INSTRUCTIONS_TAB = 'Task instructions/INSTRUCTIONS.md';

export type TabsState = { openPaths: string[]; activePath: string | null };

export const initialTabs: TabsState = {
  openPaths: [INSTRUCTIONS_TAB],
  activePath: INSTRUCTIONS_TAB,
};

/** Opens a tab to the right of the active one, or just activates it if already open. */
export function openTab(state: TabsState, path: string): TabsState {
  if (state.openPaths.includes(path)) return { ...state, activePath: path };
  const activeIndex = state.activePath ? state.openPaths.indexOf(state.activePath) : -1;
  const insertAt = activeIndex === -1 ? state.openPaths.length : activeIndex + 1;
  return {
    openPaths: [...state.openPaths.slice(0, insertAt), path, ...state.openPaths.slice(insertAt)],
    activePath: path,
  };
}

/** Closing the active tab activates its right neighbour, else the left one, else nothing. */
export function closeTab(state: TabsState, path: string): TabsState {
  const index = state.openPaths.indexOf(path);
  if (index === -1) return state;
  const openPaths = state.openPaths.filter((openPath) => openPath !== path);
  if (state.activePath !== path) return { ...state, openPaths };
  return { openPaths, activePath: openPaths[index] ?? openPaths[index - 1] ?? null };
}

export const closeAllTabs = (): TabsState => ({ openPaths: [], activePath: null });
