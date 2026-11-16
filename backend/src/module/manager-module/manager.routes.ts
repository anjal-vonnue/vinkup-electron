import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { managerController } from './manager.controller';
import { assignMentorSchema, traineeIdParamsSchema } from './manager.schema';

export const managerRoutes = Router();

managerRoutes.get('/staff', managerController.listStaff);
managerRoutes.get('/trainees', managerController.listTrainees);

managerRoutes.patch(
  '/trainees/:traineeId/mentor',
  validate({ params: traineeIdParamsSchema, body: assignMentorSchema }),
  managerController.assignMentor
);
