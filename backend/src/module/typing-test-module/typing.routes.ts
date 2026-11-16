import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { typingController } from './typing.controller';
import { saveTypingResultBodySchema } from './typing.schema';

const typingRoutes = Router();

typingRoutes.post(
  '/results',
  validate({ body: saveTypingResultBodySchema }),
  typingController.createResult
);

typingRoutes.get('/results', typingController.getResults);
typingRoutes.get('/stats', typingController.getStats);

export default typingRoutes;
