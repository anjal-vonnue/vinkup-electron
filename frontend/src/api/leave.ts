import type {
  CreateLeaveRequestInput,
  LeaveRequest,
  ReviewLeaveRequestInput,
  LeaveCountResponse,
} from '@itp/types';
import { apiClient } from './client';

/** Staff paths differ only by the role guard already applied on the server. */
export type LeaveReviewerArea = 'admin' | 'manager';

export async function createLeaveRequest(body: CreateLeaveRequestInput): Promise<LeaveRequest> {
  const res = await apiClient.post<LeaveRequest>('/leave-requests', body);
  return res.data;
}

export async function getMyLeaveRequests(): Promise<LeaveRequest[]> {
  const res = await apiClient.get<LeaveRequest[]>('/leave-requests');
  return res.data;
}

export async function getMyLeaveRequest(requestId: string): Promise<LeaveRequest> {
  const res = await apiClient.get<LeaveRequest>(`/leave-requests/${requestId}`);
  return res.data;
}

export async function getLeaveRequestsForReviewer(
  area: LeaveReviewerArea
): Promise<LeaveRequest[]> {
  const res = await apiClient.get<LeaveRequest[]>(`/${area}/leave-requests`);
  return res.data;
}

export async function getLeaveRequestForReviewer(
  area: LeaveReviewerArea,
  requestId: string
): Promise<LeaveRequest> {
  const res = await apiClient.get<LeaveRequest>(`/${area}/leave-requests/${requestId}`);
  return res.data;
}

export async function reviewLeaveRequest(
  area: LeaveReviewerArea,
  requestId: string,
  body: ReviewLeaveRequestInput
): Promise<LeaveRequest> {
  const res = await apiClient.patch<LeaveRequest>(
    `/${area}/leave-requests/${requestId}/review`,
    body
  );
  return res.data;
}

export async function getUnreadLeaveCount(since: string | null): Promise<number> {
  const params = since ? { since } : undefined;
  const { data } = await apiClient.get<LeaveCountResponse>('/leave-requests/unread-count', {
    params,
  });
  return data.count;
}

export async function getPendingLeaveCount(role: 'mentor' | 'manager'): Promise<number> {
  const path =
    role === 'manager'
      ? '/manager/leave-requests/pending-count'
      : '/admin/leave-requests/pending-count';
  const { data } = await apiClient.get<LeaveCountResponse>(path);
  return data.count;
}
