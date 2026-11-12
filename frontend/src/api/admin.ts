import type {
  AdminFeedbackEntry,
  AdminFlagEvent,
  AdminTaskCode,
  AdminTraineeDetail,
  AdminTraineeSummary,
  CreateTraineeRequest,
  TaskReview,
} from '@itp/types';
import { apiClient } from './client';

export async function getAdminTrainees(): Promise<AdminTraineeSummary[]> {
  const res = await apiClient.get<AdminTraineeSummary[]>('/admin/trainees');
  return res.data;
}

export async function getAdminTrainee(traineeId: string): Promise<AdminTraineeDetail> {
  const res = await apiClient.get<AdminTraineeDetail>(`/admin/trainees/${traineeId}`);
  return res.data;
}

export async function getAdminFlags(traineeId: string): Promise<AdminFlagEvent[]> {
  const res = await apiClient.get<AdminFlagEvent[]>(`/admin/trainees/${traineeId}/flags`);
  return res.data;
}

export async function getAdminTaskCode(traineeId: string, taskId: string): Promise<AdminTaskCode> {
  const res = await apiClient.get<AdminTaskCode>(
    `/admin/trainees/${traineeId}/tasks/${taskId}/code`
  );
  return res.data;
}

export async function createAdminTrainee(body: CreateTraineeRequest): Promise<AdminTraineeSummary> {
  const res = await apiClient.post<AdminTraineeSummary>('/admin/trainees', body);
  return res.data;
}

export async function approveTask(
  traineeId: string,
  taskId: string,
  feedback = ''
): Promise<TaskReview> {
  const res = await apiClient.post<TaskReview>(
    `/admin/trainees/${traineeId}/tasks/${taskId}/approve`,
    { feedback }
  );
  return res.data;
}

export async function requestRework(
  traineeId: string,
  taskId: string,
  feedback: string
): Promise<TaskReview> {
  const res = await apiClient.post<TaskReview>(
    `/admin/trainees/${traineeId}/tasks/${taskId}/rework`,
    { feedback }
  );
  return res.data;
}

export async function getAdminTaskReviews(
  traineeId: string,
  taskId: string
): Promise<TaskReview[]> {
  const res = await apiClient.get<TaskReview[]>(
    `/admin/trainees/${traineeId}/tasks/${taskId}/reviews`
  );
  return res.data;
}

export async function getAdminTraineeFeedback(traineeId: string): Promise<AdminFeedbackEntry[]> {
  const res = await apiClient.get<AdminFeedbackEntry[]>(`/admin/trainees/${traineeId}/feedback`);
  return res.data;
}
