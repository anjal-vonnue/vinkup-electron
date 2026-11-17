import type {
  AssignMentorRequest,
  CreateManagerStaffRequest,
  CreateManagerTraineeRequest,
  ManagerStaffMember,
  ManagerTrainee,
  SetAccountActiveRequest,
  UpdateManagerStaffRequest,
  UpdateManagerTraineeRequest,
} from '@itp/types';
import { apiClient } from './client';

export async function getManagerStaff(): Promise<ManagerStaffMember[]> {
  const res = await apiClient.get<ManagerStaffMember[]>('/manager/staff');
  return res.data;
}

export async function createManagerStaff(
  body: CreateManagerStaffRequest
): Promise<ManagerStaffMember> {
  const res = await apiClient.post<ManagerStaffMember>('/manager/staff', body);
  return res.data;
}

export async function updateManagerStaff(
  staffId: string,
  body: UpdateManagerStaffRequest
): Promise<ManagerStaffMember> {
  const res = await apiClient.patch<ManagerStaffMember>(`/manager/staff/${staffId}`, body);
  return res.data;
}

export async function setManagerStaffActive(
  staffId: string,
  body: SetAccountActiveRequest
): Promise<ManagerStaffMember> {
  const res = await apiClient.patch<ManagerStaffMember>(`/manager/staff/${staffId}/status`, body);
  return res.data;
}

export async function getManagerTrainees(): Promise<ManagerTrainee[]> {
  const res = await apiClient.get<ManagerTrainee[]>('/manager/trainees');
  return res.data;
}

export async function createManagerTrainee(
  body: CreateManagerTraineeRequest
): Promise<ManagerTrainee> {
  const res = await apiClient.post<ManagerTrainee>('/manager/trainees', body);
  return res.data;
}

export async function updateManagerTrainee(
  traineeId: string,
  body: UpdateManagerTraineeRequest
): Promise<ManagerTrainee> {
  const res = await apiClient.patch<ManagerTrainee>(`/manager/trainees/${traineeId}`, body);
  return res.data;
}

export async function setManagerTraineeActive(
  traineeId: string,
  body: SetAccountActiveRequest
): Promise<ManagerTrainee> {
  const res = await apiClient.patch<ManagerTrainee>(`/manager/trainees/${traineeId}/status`, body);
  return res.data;
}

export async function assignTraineeMentor(
  traineeId: string,
  body: AssignMentorRequest
): Promise<ManagerTrainee> {
  const res = await apiClient.patch<ManagerTrainee>(`/manager/trainees/${traineeId}/mentor`, body);
  return res.data;
}
