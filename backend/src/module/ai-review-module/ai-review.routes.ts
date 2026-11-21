import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { aiReviewController } from './ai-review.controller';
import { createPromptSchema, promptIdParamsSchema, updatePromptSchema } from './ai-review.schema';

export const aiReviewRoutes = Router();

aiReviewRoutes.get('/prompts', aiReviewController.listPrompts);

aiReviewRoutes.post(
  '/prompts',
  validate({ body: createPromptSchema }),
  aiReviewController.createPrompt
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
