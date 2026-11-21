import type {
  AdminFeedbackEntry,
  AdminAnalytics,
  AdminAnalyticsQuery,
  AdminFlagEvent,
  AdminTaskCode,
  AdminTraineeDetail,
  AdminTraineeSummary,
  CreateTraineeRequest,
  TaskReview,
  AnalyzeTasksRequest,
  AnalyzeTasksResponse,
  CreateReviewPromptRequest,
  ReviewPrompt,
  UpdateReviewPromptRequest,
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

/** GET /admin/analytics. Leave traineeId out for the whole team. */
export async function getAdminAnalytics(query: AdminAnalyticsQuery): Promise<AdminAnalytics> {
  const res = await apiClient.get<AdminAnalytics>('/admin/analytics', { params: query });
  return res.data;
}

// ---------- AI review ----------

export async function listReviewPrompts(): Promise<ReviewPrompt[]> {
  const { data } = await apiClient.get<ReviewPrompt[]>('/admin/ai-review/prompts');
  return data;
}

export async function createReviewPrompt(body: CreateReviewPromptRequest): Promise<ReviewPrompt> {
  const { data } = await apiClient.post<ReviewPrompt>('/admin/ai-review/prompts', body);
  return data;
}

export async function updateReviewPrompt(
  promptId: string,
  body: UpdateReviewPromptRequest
): Promise<ReviewPrompt> {
  const { data } = await apiClient.patch<ReviewPrompt>(
    `/admin/ai-review/prompts/${promptId}`,
    body
  );
  return data;
}

export async function deleteReviewPrompt(promptId: string): Promise<void> {
  await apiClient.delete(`/admin/ai-review/prompts/${promptId}`);
}

/** Batch analysis can take a while (sequential batches plus provider fallback). */
export async function analyzeTasks(
  traineeId: string,
  body: AnalyzeTasksRequest
): Promise<AnalyzeTasksResponse> {
  const { data } = await apiClient.post<AnalyzeTasksResponse>(
    `/admin/ai-review/trainees/${traineeId}/analyze`,
    body,
    { timeout: 5 * 60 * 1000 }
  );
  return data;
}
