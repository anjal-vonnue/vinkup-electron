import type { ReviewStatus } from './tasks';

export interface LearningObjective {
  id: string;
  code: string;
  title: string;
  description: string;
}

export interface SelfCheckItem {
  id: string;
  code: string;
  label: string;
  description: string;
  isRequired: boolean;
}

export interface DayTask {
  id: string;
  sequenceOrder: number;
  title: string;
  status: 'not_started' | 'in_progress' | 'completed';
  isStretchGoal: boolean;
  /** Current admin review state of a submitted task. null/absent = no review yet. */
  reviewStatus?: ReviewStatus | null;
}
export interface DayContent {
  dayId: string;
  courseSlug: string;
  courseTitle: string;
  dayNumber: number;
  totalDays: number;
  title: string;
  subtitle: string;
  lessonSummary: string;
  learningObjectives: LearningObjective[];
  selfCheckItems: SelfCheckItem[];
  journalPrompt: string;
}

export interface DailyJournalProps {
  prompt: string;
  initialResponse: string | null;
  isSaving: boolean;
  isSaved: boolean;
  onSave: (responseText: string) => void;
}

export interface DayCurrentStatus {
  isLocked: boolean;
  isCompleted: boolean;
}

export interface CompleteDayResponse {
  status: DayCurrentStatus;
  nextDayId: string | null;
}

export interface DayJournal {
  responseText: string | null;
}

export type SaveJournalRequest = {
  responseText: string;
};

/** Counts of recorded events for the tasks counted in a day's score. No timestamps, priorities or notes. */
export type IntegrityBreakdown = {
  pasteAttempts: number;
  tabSwitches: number;
  fullscreenExits: number;
  windowBlurs: number;
};

/** GET /api/days/:dayId/integrity */
export type DayIntegrityResponse = {
  score: number | null; // null = no task worked on yet, show "-"
};
