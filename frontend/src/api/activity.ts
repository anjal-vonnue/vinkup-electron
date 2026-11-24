import type { LogFlagEventRequest, ActivityTimeRequest, ActivityTimeDay } from '@itp/types';
import { apiClient } from './client';

export async function logFlagEvent(taskId: string, body: LogFlagEventRequest): Promise<void> {
  await apiClient.post(`/activity/${taskId}/events`, body);
}

/** Like logFlagEvent, but survives the page or app closing (keepalive). Never waits or throws. */
export function logFlagEventOnExit(taskId: string, body: LogFlagEventRequest): void {
  if (import.meta.env.VITE_USE_MOCKS === 'true') return; // the axios mock adapter can't see fetch()
  void fetch(`/api/activity/${taskId}/events`, {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export async function postActivityTime(body: ActivityTimeRequest): Promise<void> {
  await apiClient.post('/activity/time', body);
}

export function postActivityTimeOnExit(body: ActivityTimeRequest): void {
  if (import.meta.env.VITE_USE_MOCKS === 'true') return; // the axios mock adapter can't see fetch()
  void fetch('/api/activity/time', {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export async function getActivityTime(days?: number): Promise<ActivityTimeDay[]> {
  const res = await apiClient.get<ActivityTimeDay[]>('/activity/time', { params: { days } });
  return res.data;
}
