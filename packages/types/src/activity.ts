/** IDLE = no keyboard/mouse input on the task page for a while. Shown to mentors, never scored. */
export type FlagEventType =
  'FULLSCREEN_EXIT' | 'TAB_SWITCH' | 'PASTE_BLOCKED' | 'WINDOW_BLUR' | 'IDLE';

/** POST /api/activity/:taskId/events — the server sets the timestamp */
export type LogFlagEventRequest = {
  type: FlagEventType;
  durationMs?: number; // how long the trainee was away (or idle, for IDLE), if known
  context?: Record<string, string | number | boolean>; // e.g. { source: 'terminal' }
};

/** POST /api/activity/time — sent about every 60 seconds and when the tab is hidden */
export type ActivityTimeRequest = {
  activeSeconds: number;
  codingSeconds: number;
  /** The curriculum day the trainee was looking at; omitted on dashboard/profile */
  date: string;
};

/** GET /api/activity/time?days=N — one entry per calendar day, newest first */
export type ActivityTimeDay = {
  date: string; // 'YYYY-MM-DD' (Asia/Kolkata)
  activeSeconds: number;
  codingSeconds: number;
};

export type ActivityMode = 'coding' | 'none';
