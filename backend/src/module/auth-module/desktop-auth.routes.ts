import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { desktopAuthController } from './desktop-auth.controller';
import {
  createDesktopTransactionSchema,
  exchangeDesktopCodeSchema,
  logoutDesktopSessionSchema,
  refreshDesktopSessionSchema,
} from './desktop-auth.schema';

const desktopAuthRoutes = Router();

desktopAuthRoutes.post(
  '/transactions',
  validate({ body: createDesktopTransactionSchema }),
  desktopAuthController.createTransaction
);

// Browser navigation: starts the Google consent screen.
desktopAuthRoutes.get('/google', desktopAuthController.startGoogle);

// Google redirects here, then the backend redirects to the Electron loopback.
desktopAuthRoutes.get('/callback', desktopAuthController.handleGoogleCallback);

// Electron main process calls the rest; the renderer never receives a token.
desktopAuthRoutes.post(
  '/exchange',
  validate({ body: exchangeDesktopCodeSchema }),
  desktopAuthController.exchange
);
desktopAuthRoutes.get('/session', desktopAuthController.session);
desktopAuthRoutes.post(
  '/refresh',
  validate({ body: refreshDesktopSessionSchema }),
  desktopAuthController.refresh
);
desktopAuthRoutes.post(
  '/logout',
  validate({ body: logoutDesktopSessionSchema }),
  desktopAuthController.logout
);

export default desktopAuthRoutes;
