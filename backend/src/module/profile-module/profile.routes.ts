import { Router } from 'express';
import { profileController } from './profile.controller.js';

const profileRoutes = Router();

profileRoutes.get('/', profileController.getProfile);

export default profileRoutes;
