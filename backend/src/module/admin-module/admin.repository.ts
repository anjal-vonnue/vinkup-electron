import { prisma } from '../../lib/prisma';

export class AdminRepository {
  // ---------- trainees ----------

  findTrainee = (id: string) =>
    prisma.trainee.findUnique({ where: { id }, select: { id: true, name: true, email: true } });

  listTrainees = () =>
    prisma.trainee.findMany({
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });

  // ---------- curriculum ----------

  /** Every day in curriculum order (course order, then day number). Fetched once per request. */
  listDaysInOrder = () =>
    prisma.curriculum_day.findMany({
      select: {
        id: true,
        day_number: true,
        title: true,
        course: { select: { id: true, title: true } },
      },
      orderBy: [{ course: { sort_order: 'asc' } }, { day_number: 'asc' }],
    });

  listCoursesWithDays = () =>
    prisma.course.findMany({
      orderBy: { sort_order: 'asc' },
      select: {
        id: true,
        title: true,
        days: {
          orderBy: { day_number: 'asc' },
          select: { id: true, day_number: true, title: true },
        },
      },
    });

  findTask = (taskId: string) =>
    prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true, starter_files: true },
    });

  // ---------- roster aggregates (all trainees at once) ----------

  listCompletions = () =>
    prisma.day_completion.findMany({
      select: { trainee_id: true, curriculum_day_id: true },
    });

  activityTotals = () =>
    prisma.activity_log.groupBy({
      by: ['trainee_id'],
      _sum: { active_seconds: true, coding_seconds: true },
      _max: { date: true },
    });

  activityForDate = (date: Date) =>
    prisma.activity_log.findMany({
      where: { date },
      select: { trainee_id: true, active_seconds: true },
    });

  /** One row per trainee: their most recent typing result. */
  latestTypingResults = () =>
    prisma.typing_test_result.findMany({
      distinct: ['trainee_id'],
      orderBy: [{ trainee_id: 'asc' }, { taken_at: 'desc' }],
      select: { trainee_id: true, wpm: true },
    });

  flagCountsSince = (since: Date) =>
    prisma.flag_event.groupBy({
      by: ['trainee_id'],
      where: { timestamp: { gte: since } },
      _count: { _all: true },
    });

  // ---------- one trainee ----------

  listCompletionsFor = (traineeId: string) =>
    prisma.day_completion.findMany({
      where: { trainee_id: traineeId },
      select: { curriculum_day_id: true, completed_at: true },
    });
  getTotalTasks = () => prisma.task.count();
  /**
   * The tasks this trainee has worked on (in progress or completed), in curriculum order.
   * Tasks they never opened are left out; the day grid already shows how far they are.
   */
  listStartedTasks = (traineeId: string) =>
    prisma.task_progress.findMany({
      where: { trainee_id: traineeId, status: 'completed' },
      orderBy: [
        { task: { curriculum_day: { course: { sort_order: 'asc' } } } },
        { task: { curriculum_day: { day_number: 'asc' } } },
        { task: { sequence_order: 'asc' } },
      ],
      select: {
        status: true,
        code_updated_at: true,
        last_submitted_at: true,
        task: {
          select: { id: true, title: true, curriculum_day_id: true, is_stretch_goal: true },
        },
      },
    });

  /** Read only. Never creates a progress row. */
  findProgress = (traineeId: string, taskId: string) =>
    prisma.task_progress.findUnique({
      where: { trainee_id_task_id: { trainee_id: traineeId, task_id: taskId } },
    });

  listJournal = (traineeId: string) =>
    prisma.journal_response.findMany({
      where: { trainee_id: traineeId },
      orderBy: [
        { curriculum_day: { course: { sort_order: 'asc' } } },
        { curriculum_day: { day_number: 'asc' } },
      ],
      select: {
        response_text: true,
        updated_at: true,
        curriculum_day: {
          select: {
            id: true,
            day_number: true,
            title: true,
            course: { select: { title: true } },
          },
        },
      },
    });

  listFlags = (traineeId: string, take: number) =>
    prisma.flag_event.findMany({
      where: { trainee_id: traineeId },
      orderBy: { timestamp: 'desc' },
      take,
      select: {
        id: true,
        type: true,
        review_priority: true,
        duration_ms: true,
        timestamp: true,
        task: { select: { id: true, title: true, curriculum_day_id: true } },
      },
    });

  findTraineeByEmail = (email: string) =>
    prisma.trainee.findUnique({ where: { email }, select: { id: true } });

  /** Any admin row, active or not: a deactivated admin can be reactivated later. */
  findAdminByEmail = (email: string) =>
    prisma.admin.findUnique({ where: { email }, select: { id: true } });

  createTrainee = (data: { name: string; email: string }) =>
    prisma.trainee.create({ data, select: { id: true, name: true, email: true } });
  /** Tasks each trainee has worked on (a task_progress row that is not "not_started"), with the task's day. */
  findStartedTasks = (traineeIds: string[]) => {
    return prisma.task_progress.findMany({
      where: { trainee_id: { in: traineeIds }, status: { in: ['in_progress', 'completed'] } },
      select: { trainee_id: true, task_id: true, task: { select: { curriculum_day_id: true } } },
    });
  };

  /**
   * All flag events for these trainees, submitted or not, with the task's day.
   * `context_data` is deliberately NOT selected (mentor-only, and not needed for a score).
   */
  findFlagEvents = (traineeIds: string[]) => {
    return prisma.flag_event.findMany({
      where: { trainee_id: { in: traineeIds } },
      select: {
        trainee_id: true,
        task_id: true,
        type: true,
        review_priority: true,
        duration_ms: true,
        task: { select: { curriculum_day_id: true } },
      },
      orderBy: { timestamp: 'asc' },
    });
  };

  // ---------- team analytics (GET /api/admin/analytics) ----------
  // Dates: `date` columns hold an IST calendar day as midnight UTC (see istDateValue);
  // timestamp columns are compared with the moment an IST day starts (see istDayStart).

  countDays = () => prisma.curriculum_day.count();

  /** Day completions of these trainees that happened before `before`, oldest first. */
  listCompletionsBefore = (traineeIds: string[], before: Date) =>
    prisma.day_completion.findMany({
      where: { trainee_id: { in: traineeIds }, completed_at: { lt: before } },
      select: { trainee_id: true, curriculum_day_id: true, completed_at: true },
      orderBy: { completed_at: 'asc' },
    });

  /** Active and coding seconds per trainee, for the days from `fromDate` to `toDate` (both included). */
  activityTotalsBetween = (fromDate: Date, toDate: Date) =>
    prisma.activity_log.groupBy({
      by: ['trainee_id'],
      where: { date: { gte: fromDate, lte: toDate } },
      _sum: { active_seconds: true, coding_seconds: true },
    });

  /** How many task_progress rows these trainees have in each status. */
  taskStatusCounts = (traineeIds: string[]) =>
    prisma.task_progress.groupBy({
      by: ['status'],
      where: { trainee_id: { in: traineeIds } },
      _count: { _all: true },
    });

  /** Tasks these trainees submitted for the first time between `start` and `end`. */
  countFirstSubmissions = (traineeIds: string[], start: Date, end: Date) =>
    prisma.task_progress.count({
      where: { trainee_id: { in: traineeIds }, first_submitted_at: { gte: start, lt: end } },
    });

  /** Typing results of these trainees taken before `before`, oldest first. */
  listTypingResultsBefore = (traineeIds: string[], before: Date) =>
    prisma.typing_test_result.findMany({
      where: { trainee_id: { in: traineeIds }, taken_at: { lt: before } },
      select: { trainee_id: true, wpm: true, taken_at: true },
      orderBy: { taken_at: 'asc' },
    });
}
