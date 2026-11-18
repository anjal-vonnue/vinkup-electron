import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { typingController } from './typing.controller.js';
import { saveTypingResultBodySchema } from './typing.schema.js';

const typingRoutes = Router();

typingRoutes.post(
  '/results',
  validate({ body: saveTypingResultBodySchema }),
  typingController.createResult
);

typingRoutes.get('/results', typingController.getResults);
typingRoutes.get('/stats', typingController.getStats);

export default typingRoutes;
