/**
 * Pane sizing for TaskWorkspace: constants, persistence and the grid-columns string.
 * The editor is the flexible pane (always `1fr`); the sidebar and the result pane get
 * a width only once the user drags them.
 */

const STORAGE_KEY = 'itp.workspace.paneSizes';

export const HANDLE_PX = 8;
export const DEFAULT_SIDEBAR_PX = 320;
export const MIN_SIDEBAR_PX = 200;
export const MAX_SIDEBAR_PX = 560;
/** Smallest the editor can be dragged to. */
export const MIN_PANE_PX = 280;
/** Smallest the result pane can be dragged to: "Mobile S" (320px) for responsive testing. */
export const MIN_RESULT_PX = 320;

export type PaneSizes = {
  sidebar: number;
  /** null = share the space equally with the editor, as before any dragging. */
  result: number | null;
};

export type VisiblePanes = { sidebar: boolean; code: boolean; result: boolean };

export const DEFAULT_SIZES: PaneSizes = { sidebar: DEFAULT_SIDEBAR_PX, result: null };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function readSizes(): PaneSizes {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SIZES;

    const parsed = JSON.parse(raw) as { sidebar?: unknown; result?: unknown };

    return {
      sidebar:
        typeof parsed.sidebar === 'number' && Number.isFinite(parsed.sidebar)
          ? clamp(parsed.sidebar, MIN_SIDEBAR_PX, MAX_SIDEBAR_PX)
          : DEFAULT_SIDEBAR_PX,
      result:
        typeof parsed.result === 'number' &&
        Number.isFinite(parsed.result) &&
        parsed.result >= MIN_RESULT_PX
          ? parsed.result
          : null,
    };
  } catch {
    return DEFAULT_SIZES;
  }
}

export function writeSizes(sizes: PaneSizes): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Storage can be unavailable or full; the sizes just won't be remembered.
  }
}

/**
 * One track per visible pane, with an 8px track for the drag handle between neighbours.
 * A remembered size is capped so the editor always keeps its minimum width, but not by a
 * fixed percentage: the result pane can use all the room that is left for responsive tests.
 */
export function buildColumns(visible: VisiblePanes, sizes: PaneSizes): string {
  const { sidebar, code, result } = visible;
  const hasMain = code || result;
  const columns: string[] = [];

  if (sidebar) columns.push(hasMain ? `min(${sizes.sidebar}px, 45%)` : 'minmax(0, 1fr)');
  if (sidebar && hasMain) columns.push(`${HANDLE_PX}px`);
  if (code) columns.push('minmax(0, 1fr)');
  if (code && result) columns.push(`${HANDLE_PX}px`);
  if (result) {
    if (code && sizes.result !== null) {
      // Room to keep: the editor's minimum, the handles, and the sidebar when it is showing.
      const handles = (sidebar ? 1 : 0) + 1;
      const reserved = MIN_PANE_PX + handles * HANDLE_PX;
      const sidebarShare = sidebar ? ` - min(${sizes.sidebar}px, 45%)` : '';

      columns.push(`min(${sizes.result}px, calc(100% - ${reserved}px${sidebarShare}))`);
    } else {
      columns.push('minmax(0, 1fr)');
    }
  }

  return columns.join(' ');
}
