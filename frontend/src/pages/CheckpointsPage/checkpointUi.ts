import type { CheckpointAvailability, CheckpointSubmissionReason } from '@itp/types';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

type AvailabilityMeta = {
  label: string;
  tone: StatusTone;
  hint: string;
};

export const AVAILABILITY_META: Record<CheckpointAvailability, AvailabilityMeta> = {
  DRAFT: {
    label: 'Draft',
    tone: 'neutral',
    hint: 'This checkpoint has not been scheduled yet.',
  },
  UPCOMING: {
    label: 'Upcoming',
    tone: 'info',
    hint: 'You can open this checkpoint when the scheduled start time arrives.',
  },
  AVAILABLE: {
    label: 'Available now',
    tone: 'success',
    hint: 'The entry window is open. Read the instructions before you start.',
  },
  IN_PROGRESS: {
    label: 'In progress',
    tone: 'warning',
    hint: 'Your attempt is running. The timer keeps going until you submit.',
  },
  SUBMITTED: {
    label: 'Submitted',
    tone: 'neutral',
    hint: 'Your answers have been submitted.',
  },
  AWAITING_RESULTS: {
    label: 'Awaiting results',
    tone: 'info',
    hint: 'Your manager is still grading this attempt.',
  },
  RESULTS_AVAILABLE: {
    label: 'Result available',
    tone: 'success',
    hint: 'Your graded result is ready to view.',
  },
  MISSED: {
    label: 'Missed',
    tone: 'danger',
    hint: 'The entry window closed before an attempt was started.',
  },
  CANCELLED: {
    label: 'Cancelled',
    tone: 'danger',
    hint: 'This checkpoint was cancelled by a manager.',
  },
};

export function availabilityMeta(availability: CheckpointAvailability): AvailabilityMeta {
  return AVAILABILITY_META[availability] ?? AVAILABILITY_META.DRAFT;
}

export function submissionReasonLabel(reason: CheckpointSubmissionReason | null): string {
  if (reason === 'TIME_EXPIRED') return 'Time expired';
  if (reason === 'MANUAL') return 'Submitted manually';
  if (reason === 'CANCELLED') return 'Checkpoint cancelled';
  return 'Not submitted';
}

export function checkpointQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'MULTIPLE_CHOICE':
      return 'Multiple choice';
    case 'LONG_TEXT':
      return 'Long answer';
    case 'CODE':
      return 'Code';
    case 'SQL':
      return 'SQL';
    case 'FILE':
      return 'File upload';
    default:
      return 'Text';
  }
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

export function formatClockTime(value: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
