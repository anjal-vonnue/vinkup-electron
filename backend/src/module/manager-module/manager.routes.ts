import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { managerController } from './manager.controller.js';
import {
  accountStatusSchema,
  assignMentorSchema,
  createStaffSchema,
  createTraineeSchema,
  staffIdParamsSchema,
  traineeIdParamsSchema,
  updateStaffSchema,
  updateTraineeSchema,
} from './manager.schema.js';

export const managerRoutes = Router();

managerRoutes.get('/staff', managerController.listStaff);
managerRoutes.post('/staff', validate({ body: createStaffSchema }), managerController.createStaff);
managerRoutes.patch(
  '/staff/:staffId',
  validate({ params: staffIdParamsSchema, body: updateStaffSchema }),
  managerController.updateStaff
);
managerRoutes.patch(
  '/staff/:staffId/status',
  validate({ params: staffIdParamsSchema, body: accountStatusSchema }),
  managerController.setStaffActive
);

managerRoutes.get('/trainees', managerController.listTrainees);
managerRoutes.post(
  '/trainees',
  validate({ body: createTraineeSchema }),
  managerController.createTrainee
);
managerRoutes.patch(
  '/trainees/:traineeId',
  validate({ params: traineeIdParamsSchema, body: updateTraineeSchema }),
  managerController.updateTrainee
);
managerRoutes.patch(
  '/trainees/:traineeId/status',
  validate({ params: traineeIdParamsSchema, body: accountStatusSchema }),
  managerController.setTraineeActive
);

managerRoutes.patch(
  '/trainees/:traineeId/mentor',
  validate({ params: traineeIdParamsSchema, body: assignMentorSchema }),
  managerController.assignMentor
);
