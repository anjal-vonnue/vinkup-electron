import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { taskController } from './task.controller';
import { recordTimeBodySchema, saveCodeBodySchema, taskIdParamsSchema } from './task.schema';

const taskRoutes = Router();

taskRoutes.get('/:taskId', validate({ params: taskIdParamsSchema }), taskController.getTask);

taskRoutes.get('/:taskId/code', validate({ params: taskIdParamsSchema }), taskController.getCode);

taskRoutes.put(
  '/:taskId/code',
  validate({ params: taskIdParamsSchema, body: saveCodeBodySchema }),
  taskController.saveCode
);

// Time-on-task heartbeat. Safe to call frequently; server caps each delta.
taskRoutes.post(
  '/:taskId/time',
  validate({ params: taskIdParamsSchema, body: recordTimeBodySchema }),
  taskController.recordTime.bind(taskController)
);

taskRoutes.post('/:taskId/submit', validate({ params: taskIdParamsSchema }), taskController.submit);

export default taskRoutes;
