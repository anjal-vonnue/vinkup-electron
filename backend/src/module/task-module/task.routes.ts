import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { taskController } from './task.controller.js';
import { saveCodeBodySchema, taskIdParamsSchema } from './task.schema.js';

// Mounted at /api/tasks behind requireAuth in app.ts.
const taskRoutes = Router();

taskRoutes.get('/:taskId', validate({ params: taskIdParamsSchema }), taskController.getTask);

taskRoutes.get('/:taskId/code', validate({ params: taskIdParamsSchema }), taskController.getCode);

taskRoutes.put(
  '/:taskId/code',
  validate({ params: taskIdParamsSchema, body: saveCodeBodySchema }),
  taskController.saveCode
);

taskRoutes.post('/:taskId/submit', validate({ params: taskIdParamsSchema }), taskController.submit);

export default taskRoutes;
