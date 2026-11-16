import type { UserRole } from './common';

/** A mentor or manager account shown on the manager console. */
export type ManagerStaffMember = {
  id: string;
  name: string;
  email: string;
  role: Extract<UserRole, 'mentor' | 'manager'>;
  isActive: boolean;
  assignedTraineeCount: number;
  createdAt: string;
  lastLoginAt: string | null;
};

/** A trainee and their current mentor assignment. `mentor` is null when unassigned. */
export type ManagerTrainee = {
  id: string;
  name: string;
  email: string;
  mentor: {
    id: string;
    name: string;
    email: string;
  } | null;
};

/** PATCH /api/manager/trainees/:traineeId/mentor. `null` unassigns the trainee. */
export type AssignMentorRequest = {
  mentorId: string | null;
};

export type ManagerStaffListResponse = ManagerStaffMember[];
export type ManagerTraineeListResponse = ManagerTrainee[];
