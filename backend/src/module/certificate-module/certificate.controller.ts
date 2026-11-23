import type { NextFunction, Request, Response } from 'express';
import type { CertificateVerificationResponse, CourseCertificate } from '@itp/types';
import { CertificateService } from '../dashboard-module/certificate.service';
import type { CertificateIdParams } from './certificate.schema';

const certificateService = new CertificateService();

class CertificateController {
  verifyCertificate = async (
    req: Request,
    res: Response<CertificateVerificationResponse>,
    next: NextFunction
  ) => {
    try {
      const { certificateId } = req.params as CertificateIdParams;
      const result = await certificateService.verifyCertificate(certificateId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  revokeCertificate = async (
    req: Request,
    res: Response<CourseCertificate>,
    next: NextFunction
  ) => {
    try {
      const { certificateId } = req.params as CertificateIdParams;
      const result = await certificateService.revokeCertificate(certificateId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const certificateController = new CertificateController();
