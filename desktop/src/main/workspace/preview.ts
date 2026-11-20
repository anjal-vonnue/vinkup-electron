import { courseFromTaskId } from './paths';

/**
 * Courses whose built-in preview is the app's own static HTTP server. Other courses
 * keep their existing behavior: React/Node dev servers are discovered from terminal
 * output, SQL has no loopback preview, and no extra loopback port is trusted for them.
 */
const STATIC_PREVIEW_COURSES = new Set(['html', 'css', 'js']);

export function usesTrustedStaticPreview(taskId: string): boolean {
  return STATIC_PREVIEW_COURSES.has(courseFromTaskId(taskId));
}
