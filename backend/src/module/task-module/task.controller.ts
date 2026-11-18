import type { Request, Response, NextFunction } from 'express';
import type {
  SaveCodeRequest,
  SubmitTaskResponse,
  TaskCodeResponse,
  TaskResponse,
} from '@itp/types';
import type { AuthenticatedRequest } from '../../types/auth.types.js';
import type { TaskIdParams } from './task.schema.js';
import { TaskService } from './task.service.js';

const taskService = new TaskService();

// params and body are checked by validate() in task.routes.ts before these run.

class TaskController {
  getTask = async (req: Request, res: Response<TaskResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as TaskIdParams;
      const task = await taskService.getTask(traineeId, taskId);
      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  };

  getCode = async (req: Request, res: Response<TaskCodeResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as TaskIdParams;
      const code = await taskService.getCode(traineeId, taskId);
      res.status(200).json(code);
    } catch (error) {
      next(error);
    }
  };

  saveCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as TaskIdParams;
      const { files } = req.body as SaveCodeRequest;
      await taskService.saveCode(traineeId, taskId, files);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  };

  submit = async (req: Request, res: Response<SubmitTaskResponse>, next: NextFunction) => {
    try {
      const traineeId = (req as AuthenticatedRequest).user.id;
      const { taskId } = req.params as TaskIdParams;
      const result = await taskService.submit(traineeId, taskId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}

export const taskController = new TaskController();
