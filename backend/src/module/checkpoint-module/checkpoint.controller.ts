import type { NextFunction, Request, Response } from 'express';
import type {
  CheckpointAttemptTime,
  CheckpointGroup,
  CheckpointMarkdownPreview,
  CheckpointResult,
  ManagerCheckpointAttemptDetail,
  ManagerCheckpointAttemptSummary,
  ManagerCheckpointDetail,
  ManagerCheckpointSummary,
  SaveCheckpointAnswerResponse,
  SubmitCheckpointAttemptResponse,
  TraineeCheckpointAttempt,
  TraineeCheckpointDetail,
  TraineeCheckpointSummary,
} from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types';
import { CheckpointManagerService } from './checkpoint.manager.service';
import { CheckpointTraineeService } from './checkpoint.trainee.service';
import type {
  CreateCheckpointBody,
  CreateGroupBody,
  GradeAttemptBody,
  SaveAnswerBody,
  UpdateCheckpointBody,
  UpdateGroupBody,
} from './checkpoint.schema';

const managerService = new CheckpointManagerService();
const traineeService = new CheckpointTraineeService();

function traineeId(request: Request): string {
  return (request as AuthenticatedRequest).user.id;
}

function managerId(request: Request): string {
  return (request as AuthenticatedRequest).user.id;
}

export class CheckpointManagerController {
  preview = (req: Request, res: Response<CheckpointMarkdownPreview>, next: NextFunction) => {
    try {
      const { markdown } = req.body as { markdown: string };
      res.status(200).json(managerService.preview(markdown));
    } catch (error) {
      next(error);
    }
  };

  list = async (req: Request, res: Response<ManagerCheckpointSummary[]>, next: NextFunction) => {
    try {
      res.status(200).json(await managerService.list());
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response<ManagerCheckpointDetail>, next: NextFunction) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(200).json(await managerService.get(checkpointId));
    } catch (error) {
      next(error);
    }
  };

  create = async (req: Request, res: Response<ManagerCheckpointDetail>, next: NextFunction) => {
    try {
      res
        .status(201)
        .json(await managerService.create(managerId(req), req.body as CreateCheckpointBody));
    } catch (error) {
      next(error);
    }
  };

  update = async (req: Request, res: Response<ManagerCheckpointDetail>, next: NextFunction) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res
        .status(200)
        .json(
          await managerService.update(
            managerId(req),
            checkpointId,
            req.body as UpdateCheckpointBody
          )
        );
    } catch (error) {
      next(error);
    }
  };

  publish = async (req: Request, res: Response<ManagerCheckpointDetail>, next: NextFunction) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(200).json(await managerService.publish(managerId(req), checkpointId));
    } catch (error) {
      next(error);
    }
  };

  cancel = async (req: Request, res: Response<ManagerCheckpointDetail>, next: NextFunction) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(200).json(await managerService.cancel(managerId(req), checkpointId));
    } catch (error) {
      next(error);
    }
  };

  publishResults = async (
    req: Request,
    res: Response<ManagerCheckpointDetail>,
    next: NextFunction
  ) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(200).json(await managerService.publishResults(managerId(req), checkpointId));
    } catch (error) {
      next(error);
    }
  };

  listAttempts = async (
    req: Request,
    res: Response<ManagerCheckpointAttemptSummary[]>,
    next: NextFunction
  ) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(200).json(await managerService.listAttempts(checkpointId));
    } catch (error) {
      next(error);
    }
  };

  getAttempt = async (
    req: Request,
    res: Response<ManagerCheckpointAttemptDetail>,
    next: NextFunction
  ) => {
    try {
      const { attemptId } = req.params as { attemptId: string };
      res.status(200).json(await managerService.getAttempt(attemptId));
    } catch (error) {
      next(error);
    }
  };

  gradeAttempt = async (
    req: Request,
    res: Response<ManagerCheckpointAttemptDetail>,
    next: NextFunction
  ) => {
    try {
      const { attemptId } = req.params as { attemptId: string };
      res
        .status(200)
        .json(
          await managerService.gradeAttempt(managerId(req), attemptId, req.body as GradeAttemptBody)
        );
    } catch (error) {
      next(error);
    }
  };

  downloadFile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { attemptId, questionId } = req.params as {
        attemptId: string;
        questionId: string;
      };
      const file = await managerService.getAnswerFile(attemptId, questionId);
      const safeName = (file.file_name ?? 'deliverable').replace(/["\r\n]/g, '_');
      res.setHeader('Content-Type', file.file_mime_type ?? 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
      res.status(200).send(Buffer.from(file.file_data ?? '', 'base64'));
    } catch (error) {
      next(error);
    }
  };

  listGroups = async (req: Request, res: Response<CheckpointGroup[]>, next: NextFunction) => {
    try {
      res.status(200).json(await managerService.listGroups(managerId(req)));
    } catch (error) {
      next(error);
    }
  };

  createGroup = async (req: Request, res: Response<CheckpointGroup>, next: NextFunction) => {
    try {
      res
        .status(201)
        .json(await managerService.createGroup(managerId(req), req.body as CreateGroupBody));
    } catch (error) {
      next(error);
    }
  };

  updateGroup = async (req: Request, res: Response<CheckpointGroup>, next: NextFunction) => {
    try {
      const { groupId } = req.params as { groupId: string };
      res
        .status(200)
        .json(
          await managerService.updateGroup(managerId(req), groupId, req.body as UpdateGroupBody)
        );
    } catch (error) {
      next(error);
    }
  };

  deleteGroup = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { groupId } = req.params as { groupId: string };
      await managerService.deleteGroup(managerId(req), groupId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

export class CheckpointTraineeController {
  list = async (req: Request, res: Response<TraineeCheckpointSummary[]>, next: NextFunction) => {
    try {
      res.status(200).json(await traineeService.listMine(traineeId(req)));
    } catch (error) {
      next(error);
    }
  };

  get = async (req: Request, res: Response<TraineeCheckpointDetail>, next: NextFunction) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(200).json(await traineeService.getCheckpoint(traineeId(req), checkpointId));
    } catch (error) {
      next(error);
    }
  };

  start = async (req: Request, res: Response<TraineeCheckpointAttempt>, next: NextFunction) => {
    try {
      const { checkpointId } = req.params as { checkpointId: string };
      res.status(201).json(await traineeService.start(traineeId(req), checkpointId));
    } catch (error) {
      next(error);
    }
  };

  active = async (
    req: Request,
    res: Response<TraineeCheckpointAttempt | null>,
    next: NextFunction
  ) => {
    try {
      res.status(200).json(await traineeService.getActive(traineeId(req)));
    } catch (error) {
      next(error);
    }
  };

  getAttempt = async (
    req: Request,
    res: Response<TraineeCheckpointAttempt>,
    next: NextFunction
  ) => {
    try {
      const { attemptId } = req.params as { attemptId: string };
      res.status(200).json(await traineeService.getAttempt(traineeId(req), attemptId));
    } catch (error) {
      next(error);
    }
  };

  saveAnswer = async (
    req: Request,
    res: Response<SaveCheckpointAnswerResponse>,
    next: NextFunction
  ) => {
    try {
      const { attemptId, questionId } = req.params as {
        attemptId: string;
        questionId: string;
      };
      res
        .status(200)
        .json(
          await traineeService.saveAnswer(
            traineeId(req),
            attemptId,
            questionId,
            req.body as SaveAnswerBody
          )
        );
    } catch (error) {
      next(error);
    }
  };

  submit = async (
    req: Request,
    res: Response<SubmitCheckpointAttemptResponse>,
    next: NextFunction
  ) => {
    try {
      const { attemptId } = req.params as { attemptId: string };
      res.status(200).json(await traineeService.submit(traineeId(req), attemptId));
    } catch (error) {
      next(error);
    }
  };

  time = async (req: Request, res: Response<CheckpointAttemptTime>, next: NextFunction) => {
    try {
      const { attemptId } = req.params as { attemptId: string };
      res.status(200).json(await traineeService.getTime(traineeId(req), attemptId));
    } catch (error) {
      next(error);
    }
  };

  result = async (req: Request, res: Response<CheckpointResult>, next: NextFunction) => {
    try {
      const { attemptId } = req.params as { attemptId: string };
      res.status(200).json(await traineeService.getResult(traineeId(req), attemptId));
    } catch (error) {
      next(error);
    }
  };
}

export const checkpointManagerController = new CheckpointManagerController();
export const checkpointTraineeController = new CheckpointTraineeController();
