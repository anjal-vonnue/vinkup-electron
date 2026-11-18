import { Router } from 'express';
import { requireTrainee } from '../../middleware/authMiddleware.js';
import { validate } from '../../middleware/validate.js';
import { flagController } from './flag.controller.js';
import { logFlagEventSchema, taskIdParamsSchema } from './flag.schema.js';

const flagRoutes = Router();

flagRoutes.post(
  '/:taskId/events',
  requireTrainee,
  validate({ params: taskIdParamsSchema, body: logFlagEventSchema }),
  flagController.logflag
);

export default flagRoutes;
