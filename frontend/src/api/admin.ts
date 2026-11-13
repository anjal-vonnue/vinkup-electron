import type {
  AdminAnalytics,
  AdminAnalyticsQuery,
  AdminFlagEvent,
  AdminTaskCode,
  AdminTraineeDetail,
  AdminTraineeSummary,
} from '@itp/types';
import { apiClient } from './client';
import type { CreateTraineeRequest } from '@itp/types';

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

/** GET /admin/analytics. Leave traineeId out for the whole team. */
export async function getAdminAnalytics(query: AdminAnalyticsQuery): Promise<AdminAnalytics> {
  const res = await apiClient.get<AdminAnalytics>('/admin/analytics', { params: query });
  return res.data;
}
