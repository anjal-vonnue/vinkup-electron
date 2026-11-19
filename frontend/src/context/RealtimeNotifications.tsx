import { useToast } from '../components/Toast';
import { useRealtimeEvent } from './useRealtime';

/**
 * App-wide toasts for realtime events.
 *
 * Mounted once inside `ProtectedRoute` (next to `RealtimeProvider`), so a review or a
 * resubmission is announced on whatever screen the user is on — not only on the task
 * or trainee page. The pages themselves only refresh their data.
 *
 * The stream is addressed per user by the server: a trainee receives `task.reviewed`
 * for their own tasks, a mentor receives `task.submitted` from their own trainees.
 */
export function RealtimeNotifications() {
  const toast = useToast();

  useRealtimeEvent((event) => {
    if (event.type === 'task.reviewed') {
      const title = event.taskTitle ? `"${event.taskTitle}"` : 'Your task';

      if (event.decision === 'approved') {
        toast.show({
          message: `${title} was approved by ${event.mentorName}.`,
          variant: 'success',
          durationMs: 8000,
        });
        return;
      }

      toast.show({
        message: `${title} was sent back for rework by ${event.mentorName}. Open the feedback for details.`,
        variant: 'warning',
        durationMs: 8000,
      });
      return;
    }

    const action = event.submissionCount > 1 ? 'resubmitted' : 'submitted';
    const title = event.taskTitle ? `"${event.taskTitle}"` : 'a task';
    toast.show({
      message: `${event.traineeName || 'A trainee'} ${action} ${title} (attempt #${event.submissionCount}).`,
      variant: 'info',
      durationMs: 6000,
    });
  });

  return null;
}
