import { Router } from 'express';
import { journalController } from './journal.controller.js';

export const journalRouter = Router();

journalRouter.get('/', journalController.listJournal);

export default journalRouter;
