import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { checkpointManagerController, checkpointTraineeController } from './checkpoint.controller';
import {
  attemptIdParamsSchema,
  checkpointIdParamsSchema,
  createCheckpointSchema,
  createGroupSchema,
  gradeAttemptSchema,
  groupIdParamsSchema,
  previewMarkdownSchema,
  questionParamsSchema,
  saveAnswerSchema,
  updateCheckpointSchema,
  updateGroupSchema,
} from './checkpoint.schema';

/** Mounted at /api/manager/checkpoints behind requireManager. */
export const managerCheckpointRoutes = Router();

managerCheckpointRoutes.post(
  '/preview',
  validate({ body: previewMarkdownSchema }),
  checkpointManagerController.preview
);

managerCheckpointRoutes.get('/', checkpointManagerController.list);
managerCheckpointRoutes.post(
  '/',
  validate({ body: createCheckpointSchema }),
  checkpointManagerController.create
);

managerCheckpointRoutes.get(
  '/attempts/:attemptId',
  validate({ params: attemptIdParamsSchema }),
  checkpointManagerController.getAttempt
);
managerCheckpointRoutes.post(
  '/attempts/:attemptId/grade',
  validate({ params: attemptIdParamsSchema, body: gradeAttemptSchema }),
  checkpointManagerController.gradeAttempt
);
managerCheckpointRoutes.get(
  '/attempts/:attemptId/answers/:questionId/file',
  validate({ params: questionParamsSchema }),
  checkpointManagerController.downloadFile
);

managerCheckpointRoutes.get(
  '/:checkpointId',
  validate({ params: checkpointIdParamsSchema }),
  checkpointManagerController.get
);
managerCheckpointRoutes.patch(
  '/:checkpointId',
  validate({ params: checkpointIdParamsSchema, body: updateCheckpointSchema }),
  checkpointManagerController.update
);
managerCheckpointRoutes.post(
  '/:checkpointId/publish',
  validate({ params: checkpointIdParamsSchema }),
  checkpointManagerController.publish
);
managerCheckpointRoutes.post(
  '/:checkpointId/cancel',
  validate({ params: checkpointIdParamsSchema }),
  checkpointManagerController.cancel
);
managerCheckpointRoutes.post(
  '/:checkpointId/publish-results',
  validate({ params: checkpointIdParamsSchema }),
  checkpointManagerController.publishResults
);
managerCheckpointRoutes.get(
  '/:checkpointId/attempts',
  validate({ params: checkpointIdParamsSchema }),
  checkpointManagerController.listAttempts
);

/** Mounted at /api/manager/checkpoint-groups behind requireManager. */
export const managerCheckpointGroupRoutes = Router();

managerCheckpointGroupRoutes.get('/', checkpointManagerController.listGroups);
managerCheckpointGroupRoutes.post(
  '/',
  validate({ body: createGroupSchema }),
  checkpointManagerController.createGroup
);
managerCheckpointGroupRoutes.patch(
  '/:groupId',
  validate({ params: groupIdParamsSchema, body: updateGroupSchema }),
  checkpointManagerController.updateGroup
);
managerCheckpointGroupRoutes.delete(
  '/:groupId',
  validate({ params: groupIdParamsSchema }),
  checkpointManagerController.deleteGroup
);

/** Mounted at /api/checkpoints behind requireTrainee. */
export const traineeCheckpointRoutes = Router();

traineeCheckpointRoutes.get('/', checkpointTraineeController.list);
traineeCheckpointRoutes.get('/attempts/active', checkpointTraineeController.active);
traineeCheckpointRoutes.get(
  '/attempts/:attemptId',
  validate({ params: attemptIdParamsSchema }),
  checkpointTraineeController.getAttempt
);
traineeCheckpointRoutes.get(
  '/attempts/:attemptId/time',
  validate({ params: attemptIdParamsSchema }),
  checkpointTraineeController.time
);
traineeCheckpointRoutes.put(
  '/attempts/:attemptId/answers/:questionId',
  validate({ params: questionParamsSchema, body: saveAnswerSchema }),
  checkpointTraineeController.saveAnswer
);
traineeCheckpointRoutes.post(
  '/attempts/:attemptId/submit',
  validate({ params: attemptIdParamsSchema }),
  checkpointTraineeController.submit
);
traineeCheckpointRoutes.get(
  '/attempts/:attemptId/result',
  validate({ params: attemptIdParamsSchema }),
  checkpointTraineeController.result
);

traineeCheckpointRoutes.get(
  '/:checkpointId',
  validate({ params: checkpointIdParamsSchema }),
  checkpointTraineeController.get
);
traineeCheckpointRoutes.post(
  '/:checkpointId/start',
  validate({ params: checkpointIdParamsSchema }),
  checkpointTraineeController.start
);
