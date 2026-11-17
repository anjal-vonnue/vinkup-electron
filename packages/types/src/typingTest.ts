/** POST /api/typing-test/results — the server sets the time */
export type SaveTypingResultRequest = {
  wpm: number;
  accuracy: number; // 0–100
};

/** Local test statistics; duration is shown by the client but is not persisted. */
export type TypingTestStats = SaveTypingResultRequest & {
  durationSeconds: number; // how long the client-side test ran
};

/** One persisted attempt returned by POST/GET /api/typing-test/results. */
export type TypingResultRecord = {
  id: string;
  wpm: number;
  accuracy: number;
  takenAt: string; // ISO
};

/** GET /api/typing-test/summary */
export type TypingSummaryResponse = {
  latest: { wpm: number; accuracy: number; takenAt: string } | null;
  todayAverageWpm: number | null;
  trend: { date: string; averageWpm: number }[];
};

// Updated stats for Typing Tests
export type TypingStats = {
  averageWpm: number;
  averageAccuracy: number;
  highestWpm: number | null;
  highestWpmAccuracy: number | null;
};
