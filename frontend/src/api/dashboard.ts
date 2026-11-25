import type { DashboardResponse, ReworkTaskSummary, UnreadTaskComment } from '@itp/types';
import { apiClient } from './client';

export async function getDashboard(): Promise<DashboardResponse> {
  const res = await apiClient.get<DashboardResponse>('/dashboard');
  return res.data;
}

export async function getReworkTasks(): Promise<ReworkTaskSummary[]> {
  const res = await apiClient.get<ReworkTaskSummary[]>('/dashboard/rework');
  return res.data;
}

export async function getUnreadTaskComments(): Promise<UnreadTaskComment[]> {
  const res = await apiClient.get<UnreadTaskComment[]>('/dashboard/unread-comments');
  return res.data;
}

export async function markTaskCommentRead(reviewId: string): Promise<void> {
  await apiClient.patch(`/dashboard/unread-comments/${reviewId}/read`);
}
