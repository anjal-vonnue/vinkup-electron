import type { ManagerStaffMember, ManagerTrainee } from '@itp/types';
import { ConflictError, InvalidMentorError, NotFoundError } from '../../errors/AppError';
import { ManagerRepository, type TraineeWithMentor } from './manager.repository';

const repo = new ManagerRepository();

function toTrainee(row: TraineeWithMentor): ManagerTrainee {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    mentor: row.mentor,
  };
}

export class ManagerService {
  /** GET /api/manager/staff */
  listStaff = async (): Promise<ManagerStaffMember[]> => {
    const rows = await repo.listStaff();
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role === 'MANAGER' ? 'manager' : 'mentor',
      isActive: row.is_active,
      assignedTraineeCount: row._count.assigned_trainees,
      createdAt: row.created_at.toISOString(),
      lastLoginAt: row.last_login_at?.toISOString() ?? null,
    }));
  };

  /** GET /api/manager/trainees */
  listTrainees = async (): Promise<ManagerTrainee[]> => {
    const rows = await repo.listTraineesWithMentor();
    return rows.map(toTrainee);
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
