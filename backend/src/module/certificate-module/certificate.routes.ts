import { Router } from 'express';
import { requireStaff } from '../../middleware/authMiddleware';
import { createRateLimit } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import { certificateController } from './certificate.controller';
import { certificateIdParamsSchema } from './certificate.schema';

const verifyRateLimit = createRateLimit({ windowMs: 60_000, max: 30 });

/** Public certificate verification. Mounted without authentication. */
export const certificatePublicRoutes = Router();

certificatePublicRoutes.get(
  '/verify/:certificateId',
  verifyRateLimit,
  validate({ params: certificateIdParamsSchema }),
  certificateController.verifyCertificate
);

/** Staff-only certificate management. */
export const certificateStaffRoutes = Router();

certificateStaffRoutes.post(
  '/:certificateId/revoke',
  requireStaff,
  validate({ params: certificateIdParamsSchema }),
  certificateController.revokeCertificate
);
