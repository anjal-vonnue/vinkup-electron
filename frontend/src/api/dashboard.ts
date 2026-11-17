import type { DashboardResponse, ReworkTaskSummary } from '@itp/types';
import { apiClient } from './client';

export async function getDashboard(): Promise<DashboardResponse> {
  const res = await apiClient.get<DashboardResponse>('/dashboard');
  return res.data;
}

export async function getReworkTasks(): Promise<ReworkTaskSummary[]> {
  const res = await apiClient.get<ReworkTaskSummary[]>('/dashboard/rework');
  return res.data;
}
