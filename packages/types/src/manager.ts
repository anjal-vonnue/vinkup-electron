import type { UserRole } from './common';

export type ManagerStaffRole = Extract<UserRole, 'mentor' | 'manager'>;

/** A mentor or manager account shown on the manager console. */
export type ManagerStaffMember = {
  id: string;
  name: string;
  email: string;
  role: ManagerStaffRole;
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
  isActive: boolean;
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

export type CreateManagerStaffRequest = {
  name: string;
  email: string;
  role: ManagerStaffRole;
};

export type UpdateManagerStaffRequest = {
  name?: string;
  email?: string;
  role?: ManagerStaffRole;
};

export type UpdateManagerTraineeRequest = {
  name?: string;
  email?: string;
};

export type CreateManagerTraineeRequest = {
  name: string;
  email: string;
  /** Assign the new trainee immediately when provided. */
  mentorId?: string | null;
};

/** PATCH /api/manager/{staff,trainees}/:id/status */
export type SetAccountActiveRequest = {
  isActive: boolean;
};
