/**
 * Checkpoint assessments.
 *
 * A manager uploads a Markdown paper; the backend parses it into instructions and
 * questions. A published checkpoint is scheduled for individual trainees and/or
 * trainee groups. Each trainee's attempt has a server-owned deadline and is
 * finalised by the deadline processor even if the browser is closed.
 */

export type CheckpointStatus = 'DRAFT' | 'SCHEDULED' | 'CANCELLED';

export type CheckpointQuestionType =
  'TEXT' | 'LONG_TEXT' | 'CODE' | 'SQL' | 'MULTIPLE_CHOICE' | 'FILE';

export type CheckpointResultVisibility = 'IMMEDIATE' | 'AFTER_APPROVAL';

export type CheckpointSubmissionReason = 'MANUAL' | 'TIME_EXPIRED' | 'CANCELLED';

/** Derived for a trainee; never stored on the checkpoint row. */
export type CheckpointAvailability =
  | 'DRAFT'
  | 'UPCOMING'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'AWAITING_RESULTS'
  | 'RESULTS_AVAILABLE'
  | 'MISSED'
  | 'CANCELLED';

export type ParsedCheckpointQuestion = {
  orderIndex: number;
  title: string;
  promptMarkdown: string;
  type: CheckpointQuestionType;
  marks: number;
  options: string[] | null;
  correctOption: string | null;
  codeLanguage: string | null;
};

export type CheckpointMarkdownPreview = {
  suggestedTitle: string | null;
  instructionsMarkdown: string;
  questions: ParsedCheckpointQuestion[];
  totalQuestionMarks: number;
  warnings: string[];
};

export type CheckpointQuestion = ParsedCheckpointQuestion & { id: string };

export type CheckpointAssignmentSelection = {
  traineeIds: string[];
  groupIds: string[];
};

export type ManagerCheckpointSummary = {
  id: string;
  title: string;
  description: string;
  status: CheckpointStatus;
  startAt: string | null;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  maxAttempts: number;
  allowEarlySubmission: boolean;
  allowLateEntry: boolean;
  resultVisibility: CheckpointResultVisibility;
  resultsPublishedAt: string | null;
  assignedCount: number;
  attemptCount: number;
  submittedCount: number;
  gradedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ManagerCheckpointDetail = ManagerCheckpointSummary & {
  sourceFileName: string | null;
  sourceMarkdown: string;
  instructionsMarkdown: string;
  questions: CheckpointQuestion[];
  assignment: CheckpointAssignmentSelection;
};

export type CreateCheckpointRequest = {
  title: string;
  description: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  startAt?: string | null;
  maxAttempts?: number;
  allowEarlySubmission?: boolean;
  allowLateEntry?: boolean;
  resultVisibility?: CheckpointResultVisibility;
  sourceFileName?: string | null;
  sourceMarkdown: string;
  traineeIds?: string[];
  groupIds?: string[];
};

export type UpdateCheckpointRequest = Partial<CreateCheckpointRequest> & {
  /** Present so an explicit `null` clears the schedule on a draft. */
  startAt?: string | null;
};

export type CheckpointGroupMember = {
  id: string;
  name: string;
  email: string;
};

export type CheckpointGroup = {
  id: string;
  name: string;
  members: CheckpointGroupMember[];
  createdAt: string;
};

export type CreateCheckpointGroupRequest = {
  name: string;
  traineeIds: string[];
};

export type ManagerCheckpointAttemptSummary = {
  id: string;
  traineeId: string;
  traineeName: string;
  traineeEmail: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  submissionReason: CheckpointSubmissionReason | null;
  totalScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  gradedAt: string | null;
  resultVisible: boolean;
};

export type CheckpointAttemptEvent = {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
};

export type ManagerCheckpointAnswer = {
  questionId: string;
  answerText: string | null;
  selectedOption: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  awardedMarks: number | null;
  feedback: string | null;
  savedAt: string | null;
};

export type ManagerCheckpointAttemptDetail = ManagerCheckpointAttemptSummary & {
  checkpointId: string;
  checkpointTitle: string;
  checkpointTotalMarks: number;
  feedback: string | null;
  gradedByName: string | null;
  questions: CheckpointQuestion[];
  answers: ManagerCheckpointAnswer[];
  events: CheckpointAttemptEvent[];
};

export type GradeCheckpointAttemptRequest = {
  marks: Array<{ questionId: string; awardedMarks: number }>;
  feedback?: string | null;
};

export type TraineeCheckpointAttemptSummary = {
  id: string;
  attemptNumber: number;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  submissionReason: CheckpointSubmissionReason | null;
  totalScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  gradedAt: string | null;
  resultVisible: boolean;
};

export type TraineeCheckpointSummary = {
  id: string;
  title: string;
  description: string;
  startAt: string;
  durationMinutes: number;
  totalMarks: number;
  passingMarks: number;
  availability: CheckpointAvailability;
  serverNow: string;
  canStart: boolean;
  blockedReason: string | null;
  attempt: TraineeCheckpointAttemptSummary | null;
};

export type TraineeCheckpointDetail = TraineeCheckpointSummary & {
  instructionsMarkdown: string;
  allowEarlySubmission: boolean;
  allowLateEntry: boolean;
  maxAttempts: number;
  attemptsUsed: number;
  resultVisibility: CheckpointResultVisibility;
  resultsPublishedAt: string | null;
};

export type TraineeCheckpointAnswer = {
  questionId: string;
  answerText: string | null;
  selectedOption: string | null;
  fileName: string | null;
  fileMimeType: string | null;
  fileSize: number | null;
  clientRevision: number;
  savedAt: string | null;
};

export type TraineeCheckpointAttempt = {
  id: string;
  checkpointId: string;
  checkpointTitle: string;
  instructionsMarkdown: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  startedAt: string;
  deadlineAt: string;
  serverNow: string;
  remainingSeconds: number;
  submittedAt: string | null;
  submissionReason: CheckpointSubmissionReason | null;
  allowEarlySubmission: boolean;
  totalMarks: number;
  passingMarks: number;
  attemptNumber: number;
  questions: CheckpointQuestion[];
  answers: TraineeCheckpointAnswer[];
  result: CheckpointResult | null;
};

export type CheckpointFileInput = {
  name: string;
  mimeType: string;
  size: number;
  /** Base64 (no data: prefix). Kept in the database, so it survives a reload. */
  dataBase64: string;
};

export type SaveCheckpointAnswerRequest = {
  clientRevision: number;
  answerText?: string | null;
  selectedOption?: string | null;
  file?: CheckpointFileInput | null;
  clearFile?: boolean;
};

export type SaveCheckpointAnswerResponse = {
  questionId: string;
  clientRevision: number;
  savedAt: string;
  /** True when a newer revision was already stored; the returned revision wins. */
  stale: boolean;
};

export type CheckpointAttemptTime = {
  serverNow: string;
  deadlineAt: string;
  remainingSeconds: number;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  submittedAt: string | null;
  submissionReason: CheckpointSubmissionReason | null;
};

export type SubmitCheckpointAttemptResponse = {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED';
  submittedAt: string | null;
  submissionReason: CheckpointSubmissionReason | null;
  totalScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  gradedAt: string | null;
  resultVisible: boolean;
};

export type CheckpointResultAnswer = {
  questionId: string;
  questionTitle: string;
  questionType: CheckpointQuestionType;
  marks: number;
  answerText: string | null;
  selectedOption: string | null;
  fileName: string | null;
  awardedMarks: number | null;
  feedback: string | null;
};

export type CheckpointResult = {
  attemptId: string;
  checkpointId: string;
  checkpointTitle: string;
  submittedAt: string | null;
  submissionReason: CheckpointSubmissionReason | null;
  totalMarks: number;
  passingMarks: number;
  score: number | null;
  percentage: number | null;
  passed: boolean | null;
  gradedAt: string | null;
  feedback: string | null;
  resultPublishedAt: string | null;
  visible: boolean;
  answers: CheckpointResultAnswer[];
};

export type CheckpointPreviewRequest = {
  markdown: string;
};
