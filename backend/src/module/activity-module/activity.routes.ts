import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { activityController } from './activity.controller.js';
import { activityTimeBodySchema } from './activity.schema.js';

const activityRoutes = Router();

activityRoutes.post(
  '/time',
  validate({ body: activityTimeBodySchema }),
  activityController.addTime
);
activityRoutes.get('/time', activityController.listTime);

export default activityRoutes;
