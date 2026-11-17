import type { DayTask } from './dayOverview';

/** Current admin review state of a submitted task. null (absent) = no review yet. */
export type ReviewStatus = 'pending' | 'approved' | 'rework';

/** The decision in one review history entry. */
export type ReviewDecision = 'approved' | 'rework';

/** One review of one submission attempt. feedback may be empty for a plain approval. */
export type TaskReview = {
  id: string;
  taskId: string;
  adminId: string;
  adminName: string;
  /** The submission attempt this review judged (1 = first submission). */
  submissionNo: number;
  decision: ReviewDecision;
  feedback: string;
  reviewedAt: string;
};

/** GET /api/tasks/:taskId/review — the trainee's own current review state. */
export type TaskReviewSummary = {
  reviewStatus: ReviewStatus | null; // null = no review yet
  submissionCount: number; // 0 = never submitted
  latestReview: TaskReview | null;
};

/** GET /api/tasks/:taskId/reviews — the trainee's own review history, newest first. */
export type TaskReviewListResponse = TaskReview[];

/** Same values the day page uses: 'not_started' | 'in_progress' | 'completed' */
export type TaskStatus = DayTask['status'];

export type TaskFile = {
  path: string; // e.g. "src/App.tsx"
  content: string;
};

/** How the Run button executes a task. Set per task in the seed data. */
export type TaskRuntime = 'browser' | 'node' | 'sql';

/** GET /api/tasks/:taskId */
export type TaskResponse = {
  id: string;
  title: string;
  instructionsMarkdown: string;
  isStretchGoal: boolean;
  sequenceOrder: number;
  estimatedMinutes: number | null;
  status: TaskStatus;
  /** Current admin review state: pending = submitted and waiting, approved, rework. null = no review yet. */
  reviewStatus: ReviewStatus | null;
  /** How many times this trainee has submitted the task. */
  submissionCount: number;
  day: {
    id: string;
    dayNumber: number;
    courseTitle: string;
  };
  runtime: TaskRuntime;
  /** node only: what Run types into the terminal, e.g. "npm test". null for browser and sql. */
  runCommand: string | null;
  /** sql only: schema and seed data run on a fresh database when the task opens and on Reset. null = start empty. */
  setupSql: string | null;
};

/** GET /api/tasks/:taskId/code */
export type TaskCodeResponse = {
  files: TaskFile[];
  updatedAt: string | null; // null = never saved
};

/** PUT /api/tasks/:taskId/code */
export type SaveCodeRequest = {
  files: TaskFile[];
};

/** POST /api/tasks/:taskId/submit — can be called more than once; does not lock editing.
 *  Blocked with ALREADY_APPROVED once an admin has approved the task. */
export type SubmitTaskResponse = {
  status: 'completed';
  submittedAt: string;
  /** Always 'pending' after a submit: the new submission is waiting for review again. */
  reviewStatus: ReviewStatus;
  submissionCount: number;
};
