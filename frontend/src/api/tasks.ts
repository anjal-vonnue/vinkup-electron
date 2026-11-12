import type {
  TaskResponse,
  TaskCodeResponse,
  SaveCodeRequest,
  SubmitTaskResponse,
  TaskReviewSummary,
  TaskReviewListResponse,
} from '@itp/types';
import { apiClient } from './client';

export async function getTask(taskId: string): Promise<TaskResponse> {
  const res = await apiClient.get<TaskResponse>(`/tasks/${taskId}`);

  return res.data;
}

export async function getTaskCode(taskId: string): Promise<TaskCodeResponse> {
  const res = await apiClient.get<TaskCodeResponse>(`/tasks/${taskId}/code`);

  return res.data;
}

export async function saveTaskCode(taskId: string, body: SaveCodeRequest): Promise<void> {
  await apiClient.put(`/tasks/${taskId}/code`, body);
}

export async function submitTask(taskId: string): Promise<SubmitTaskResponse> {
  const res = await apiClient.post<SubmitTaskResponse>(`/tasks/${taskId}/submit`);

  return res.data;
}

export async function getTaskReview(taskId: string): Promise<TaskReviewSummary> {
  const res = await apiClient.get<TaskReviewSummary>(`/tasks/${taskId}/review`);

  return res.data;
}

export async function getTaskReviews(taskId: string): Promise<TaskReviewListResponse> {
  const res = await apiClient.get<TaskReviewListResponse>(`/tasks/${taskId}/reviews`);

  return res.data;
}
