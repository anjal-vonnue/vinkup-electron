import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import { env } from '../../config/env.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidMentorError,
  NotFoundError,
  TraineeDomainError,
} from '../../errors/AppError.js';
import { ManagerRepository, type StaffRow, type TraineeWithMentor } from './manager.repository.js';
import type {
  CreateManagerTraineeBody,
  CreateStaffBody,
  UpdateManagerTraineeBody,
  UpdateStaffBody,
} from './manager.schema.js';

const repo = new ManagerRepository();

/** Prisma's unique-constraint error, without importing Prisma's error classes. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function assertCompanyDomain(email: string): void {
  if (!email.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN.toLowerCase()}`)) {
    throw new TraineeDomainError(env.ALLOWED_EMAIL_DOMAIN);
  }
}

function toStaff(row: StaffRow): ManagerStaffMember {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role === 'MANAGER' ? 'manager' : 'mentor',
    isActive: row.is_active,
    assignedTraineeCount: row._count.assigned_trainees,
    createdAt: row.created_at.toISOString(),
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
  };
}

function toTrainee(row: TraineeWithMentor): ManagerTrainee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    isActive: row.is_active,
    mentor: row.mentor,
  };
}

export class ManagerService {
  /** GET /api/manager/staff */
  listStaff = async (): Promise<ManagerStaffMember[]> => {
    const rows = await repo.listStaff();
    return rows.map(toStaff);
  };

  /** GET /api/manager/trainees */
  listTrainees = async (): Promise<ManagerTrainee[]> => {
    const rows = await repo.listTraineesWithMentor();
    return rows.map(toTrainee);
  };

  /** POST /api/manager/staff */
  createStaff = async (input: CreateStaffBody, managerId: string): Promise<ManagerStaffMember> => {
    const name = normalizeName(input.name);
    const { email, role } = input;
    assertCompanyDomain(email);

    const [existingStaff, existingTrainee] = await Promise.all([
      repo.findStaffByEmail(email),
      repo.findTraineeByEmail(email),
    ]);
    if (existingTrainee) {
      throw new ConflictError('TRAINEE_EXISTS', 'This email belongs to a trainee account.');
    }
    if (existingStaff) {
      throw new ConflictError('STAFF_EXISTS', 'A staff account with this email already exists.');
    }

    let created: StaffRow;
    try {
      created = await repo.createStaff({
        name,
        email,
        role: role === 'manager' ? 'MANAGER' : 'MENTOR',
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('STAFF_EXISTS', 'A staff account with this email already exists.');
      }
      throw error;
    }

    console.info(`[manager] ${managerId} created ${role} account ${created.id}`);
    return toStaff(created);
  };

  /** PATCH /api/manager/staff/:staffId */
  updateStaff = async (
    staffId: string,
    input: UpdateStaffBody,
    managerId: string
  ): Promise<ManagerStaffMember> => {
    const existing = await repo.findStaffById(staffId);
    if (!existing) throw new NotFoundError('Staff account not found.');

    if (staffId === managerId && input.role && input.role !== 'manager') {
      throw new ForbiddenError('You cannot change your own role.');
    }

    if (input.role === 'manager' && existing.role === 'MENTOR') {
      const assigned = await repo.countAssignedTrainees(staffId);
      if (assigned > 0) {
        throw new ConflictError(
          'STAFF_HAS_TRAINEES',
          'Reassign this mentor’s trainees before changing the account role.'
        );
      }
    }

    const data: { name?: string; email?: string; role?: 'MENTOR' | 'MANAGER' } = {};
    if (input.name !== undefined) data.name = normalizeName(input.name);
    if (input.email !== undefined && input.email !== existing.email) {
      assertCompanyDomain(input.email);
      const [otherStaff, existingTrainee] = await Promise.all([
        repo.findStaffByEmail(input.email),
        repo.findTraineeByEmail(input.email),
      ]);
      if (existingTrainee) {
        throw new ConflictError('TRAINEE_EXISTS', 'This email belongs to a trainee account.');
      }
      if (otherStaff && otherStaff.id !== staffId) {
        throw new ConflictError('STAFF_EXISTS', 'A staff account with this email already exists.');
      }
      data.email = input.email;
    }
    if (input.role !== undefined) data.role = input.role === 'manager' ? 'MANAGER' : 'MENTOR';

    let updated: StaffRow;
    try {
      updated = await repo.updateStaff(staffId, data);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('STAFF_EXISTS', 'A staff account with this email already exists.');
      }
      throw error;
    }

    console.info(`[manager] ${managerId} updated staff account ${staffId}`);
    return toStaff(updated);
  };

  /** PATCH /api/manager/staff/:staffId/status */
  setStaffActive = async (
    staffId: string,
    isActive: boolean,
    managerId: string
  ): Promise<ManagerStaffMember> => {
    if (staffId === managerId && !isActive) {
      throw new ForbiddenError('You cannot deactivate your own account.');
    }

    const existing = await repo.findStaffById(staffId);
    if (!existing) throw new NotFoundError('Staff account not found.');

    if (!isActive && existing.role === 'MENTOR') {
      const assigned = await repo.countAssignedTrainees(staffId);
      if (assigned > 0) {
        throw new ConflictError(
          'STAFF_HAS_TRAINEES',
          'Reassign this mentor’s trainees before deactivating the account.'
        );
      }
    }

    const updated = await repo.setStaffActive(staffId, isActive);
    console.info(
      `[manager] ${managerId} ${isActive ? 'activated' : 'deactivated'} staff account ${staffId}`
    );
    return toStaff(updated);
  };

  /** POST /api/manager/trainees */
  createTrainee = async (
    input: CreateManagerTraineeBody,
    managerId: string
  ): Promise<ManagerTrainee> => {
    const name = normalizeName(input.name);
    const { email } = input;
    assertCompanyDomain(email);

    const mentorId = input.mentorId ?? null;
    if (mentorId) {
      const mentor = await repo.findAssignableMentor(mentorId);
      if (!mentor) throw new InvalidMentorError();
    }

    const [existingTrainee, existingStaff] = await Promise.all([
      repo.findTraineeByEmail(email),
      repo.findStaffByEmail(email),
    ]);
    if (existingStaff) {
      throw new ConflictError('EMAIL_BELONGS_TO_ADMIN', 'This email belongs to a staff account.');
    }
    if (existingTrainee) {
      throw new ConflictError('TRAINEE_EXISTS', 'A trainee with this email already exists.');
    }

    let created: TraineeWithMentor;
    try {
      created = await repo.createTrainee({ name, email, mentorId });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('TRAINEE_EXISTS', 'A trainee with this email already exists.');
      }
      throw error;
    }

    console.info(`[manager] ${managerId} created trainee ${created.id}`);
    return toTrainee(created);
  };

  /** PATCH /api/manager/trainees/:traineeId */
  updateTrainee = async (
    traineeId: string,
    input: UpdateManagerTraineeBody,
    managerId: string
  ): Promise<ManagerTrainee> => {
    const existing = await repo.findTraineeById(traineeId);
    if (!existing) throw new NotFoundError('Trainee not found.');

    const data: { name?: string; email?: string } = {};
    if (input.name !== undefined) data.name = normalizeName(input.name);
    if (input.email !== undefined && input.email !== existing.email) {
      assertCompanyDomain(input.email);
      const [otherTrainee, existingStaff] = await Promise.all([
        repo.findTraineeByEmail(input.email),
        repo.findStaffByEmail(input.email),
      ]);
      if (existingStaff) {
        throw new ConflictError('EMAIL_BELONGS_TO_ADMIN', 'This email belongs to a staff account.');
      }
      if (otherTrainee && otherTrainee.id !== traineeId) {
        throw new ConflictError('TRAINEE_EXISTS', 'A trainee with this email already exists.');
      }
      data.email = input.email;
    }

    let updated: TraineeWithMentor;
    try {
      updated = await repo.updateTrainee(traineeId, data);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('TRAINEE_EXISTS', 'A trainee with this email already exists.');
      }
      throw error;
    }

    console.info(`[manager] ${managerId} updated trainee ${traineeId}`);
    return toTrainee(updated);
  };

  /** PATCH /api/manager/trainees/:traineeId/status */
  setTraineeActive = async (
    traineeId: string,
    isActive: boolean,
    managerId: string
  ): Promise<ManagerTrainee> => {
    const existing = await repo.findTraineeById(traineeId);
    if (!existing) throw new NotFoundError('Trainee not found.');

    const updated = await repo.setTraineeActive(traineeId, isActive);
    console.info(
      `[manager] ${managerId} ${isActive ? 'activated' : 'deactivated'} trainee ${traineeId}`
    );
    return toTrainee(updated);
  };

  /**
   * PATCH /api/manager/trainees/:traineeId/mentor
   * A null mentorId unassigns. Repeating an unassign is a harmless no-op.
   */
  assignMentor = async (
    traineeId: string,
    mentorId: string | null,
    managerId: string
  ): Promise<ManagerTrainee> => {
    const outcome = await repo.assignMentor(traineeId, mentorId);

    switch (outcome.status) {
      case 'trainee-not-found':
        throw new NotFoundError('Trainee not found.');
      case 'mentor-not-found':
        throw new NotFoundError('Mentor not found.');
      case 'mentor-invalid':
        throw new InvalidMentorError('Choose an active mentor account.');
      case 'already-assigned':
        throw new ConflictError(
          'ALREADY_ASSIGNED',
          'This trainee is already assigned to that mentor.'
        );
      case 'assigned':
        console.info(
          `[manager] ${managerId} ${
            mentorId
              ? `assigned trainee ${traineeId} to mentor ${mentorId}`
              : `unassigned trainee ${traineeId}`
          }`
        );
        return toTrainee(outcome.trainee);
    }
  };
}
