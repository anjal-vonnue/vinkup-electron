import type { Request, Response, NextFunction } from 'express';
import type { AnalyzeTasksResponse, ReviewPrompt } from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types';
import type { AnalyzeBody, CreatePromptBody, UpdatePromptBody } from './ai-review.schema';
import { AiReviewService } from './ai-review.service';

const service = new AiReviewService();

class AiReviewController {
  listPrompts = async (req: Request, res: Response<ReviewPrompt[]>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id;
      res.json(await service.listPrompts(adminId));
    } catch (error) {
      next(error);
    }
  };

  createPrompt = async (req: Request, res: Response<ReviewPrompt>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id;
      res.status(201).json(await service.createPrompt(adminId, req.body as CreatePromptBody));
    } catch (error) {
      next(error);
    }
  };

  updatePrompt = async (req: Request, res: Response<ReviewPrompt>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id;
      const { promptId } = req.params as { promptId: string };
      res.json(await service.updatePrompt(adminId, promptId, req.body as UpdatePromptBody));
    } catch (error) {
      next(error);
    }
  };

  deletePrompt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id;
      const { promptId } = req.params as { promptId: string };
      await service.deletePrompt(adminId, promptId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  analyze = async (req: Request, res: Response<AnalyzeTasksResponse>, next: NextFunction) => {
    try {
      const adminId = (req as AuthenticatedRequest).user.id;
      const { traineeId } = req.params as { traineeId: string };
      res.json(await service.analyze(adminId, traineeId, req.body as AnalyzeBody));
    } catch (error) {
      next(error);
    }
  };
}

export const aiReviewController = new AiReviewController();
