import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { dayTasksParamsSchema } from './day-tasks.schema.js';
import { dayTasksController } from './day-tasks.controller.js';
import { journalDayIdParamsSchema, saveJournalBodySchema } from './journal.schema.js';
import { journalController } from './journal.controller.js';
import { integrityController } from './integrity.controller.js';
import { dayController } from './day.controller.js';

export const dayRouter = Router();

dayRouter.get('/:dayId', validate({ params: journalDayIdParamsSchema }), dayController.getDay);

dayRouter.get(
  '/:dayId/status',
  validate({ params: journalDayIdParamsSchema }),
  dayController.getStatus
);

dayRouter.patch(
  '/:dayId/complete',
  validate({ params: journalDayIdParamsSchema }),
  dayController.completeDay
);

// Kept for the existing day overview client; the documented endpoint is /:dayId/complete.
dayRouter.patch(
  '/:dayId/status',
  validate({ params: journalDayIdParamsSchema }),
  dayController.completeDayStatus
);

dayRouter.get(
  '/:dayId/journal',
  validate({ params: journalDayIdParamsSchema }),
  journalController.getJournal
);

dayRouter.put(
  '/:dayId/journal',
  validate({ params: journalDayIdParamsSchema, body: saveJournalBodySchema }),
  journalController.saveJournal
);

dayRouter.get(
  '/:dayId/tasks',
  validate({ params: dayTasksParamsSchema }),
  dayTasksController.getDayTasks
);
dayRouter.get(
  '/:dayId/integrity',
  validate({ params: dayTasksParamsSchema }),
  integrityController.getDayIntegrity
);

export default dayRouter;
