import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { aiReviewController } from './ai-review.controller';
import { traineeIdParamsSchema } from '../admin-module/admin.schema';
import { requireAssignedTrainee } from '../../middleware/authMiddleware';
import { analyzeSchema } from './ai-review.schema';
import { createPromptSchema, promptIdParamsSchema, updatePromptSchema } from './ai-review.schema';

export const aiReviewRoutes = Router();

aiReviewRoutes.get('/prompts', aiReviewController.listPrompts);

aiReviewRoutes.post(
  '/prompts',
  validate({ body: createPromptSchema }),
  aiReviewController.createPrompt
);

aiReviewRoutes.post(
  '/trainees/:traineeId/analyze',
  validate({ params: traineeIdParamsSchema, body: analyzeSchema }),
  requireAssignedTrainee,
  aiReviewController.analyze
);

aiReviewRoutes.patch(
  '/prompts/:promptId',
  validate({ params: promptIdParamsSchema, body: updatePromptSchema }),
  aiReviewController.updatePrompt
);

aiReviewRoutes.delete(
  '/prompts/:promptId',
  validate({ params: promptIdParamsSchema }),
  aiReviewController.deletePrompt
);
