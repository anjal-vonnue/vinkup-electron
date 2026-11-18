import { prisma } from '../../lib/prisma.js';

const staffSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  is_active: true,
  created_at: true,
  last_login_at: true,
  _count: { select: { assigned_trainees: true } },
} as const;

const traineeWithMentor = {
  id: true,
  name: true,
  email: true,
  is_active: true,
  mentor: { select: { id: true, name: true, email: true } },
} as const;

export type StaffRow = {
  id: string;
  name: string;
  email: string;
  role: 'MENTOR' | 'MANAGER';
  is_active: boolean;
  created_at: Date;
  last_login_at: Date | null;
  _count: { assigned_trainees: number };
};

export type TraineeWithMentor = {
  id: string;
  name: string;
  email: string;
  is_active: boolean;
  mentor: { id: string; name: string; email: string } | null;
};

export type AssignMentorOutcome =
  | { status: 'assigned'; trainee: TraineeWithMentor }
  | { status: 'trainee-not-found' }
  | { status: 'mentor-not-found' }
  | { status: 'mentor-invalid' }
  | { status: 'already-assigned' };

export class ManagerRepository {
  listStaff = () =>
    prisma.admin.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: staffSelect,
    }) as Promise<StaffRow[]>;

  findStaffById = (id: string) =>
    prisma.admin.findUnique({ where: { id }, select: staffSelect }) as Promise<StaffRow | null>;

  findStaffByEmail = (email: string) =>
    prisma.admin.findUnique({ where: { email }, select: { id: true } });

  findTraineeByEmail = (email: string) =>
    prisma.trainee.findUnique({ where: { email }, select: { id: true } });

  createStaff = (data: { name: string; email: string; role: 'MENTOR' | 'MANAGER' }) =>
    prisma.admin.create({
      data: { name: data.name, email: data.email, role: data.role },
      select: staffSelect,
    }) as Promise<StaffRow>;

  updateStaff = (
    id: string,
    data: { name?: string; email?: string; role?: 'MENTOR' | 'MANAGER' }
  ) =>
    prisma.admin.update({
      where: { id },
      data,
      select: staffSelect,
    }) as Promise<StaffRow>;

  setStaffActive = (id: string, isActive: boolean) =>
    prisma.admin.update({
      where: { id },
      data: { is_active: isActive },
      select: staffSelect,
    }) as Promise<StaffRow>;

  countAssignedTrainees = (staffId: string) =>
    prisma.trainee.count({ where: { mentor_id: staffId } });

  createTrainee = (data: { name: string; email: string; mentorId: string | null }) =>
    prisma.trainee.create({
      data: { name: data.name, email: data.email, mentor_id: data.mentorId },
      select: traineeWithMentor,
    }) as Promise<TraineeWithMentor>;

  findTraineeById = (id: string) =>
    prisma.trainee.findUnique({
      where: { id },
      select: traineeWithMentor,
    }) as Promise<TraineeWithMentor | null>;

  updateTrainee = (id: string, data: { name?: string; email?: string }) =>
    prisma.trainee.update({
      where: { id },
      data,
      select: traineeWithMentor,
    }) as Promise<TraineeWithMentor>;

  setTraineeActive = (id: string, isActive: boolean) =>
    prisma.trainee.update({
      where: { id },
      data: { is_active: isActive },
      select: traineeWithMentor,
    }) as Promise<TraineeWithMentor>;

  listTraineesWithMentor = () =>
    prisma.trainee.findMany({
      orderBy: { name: 'asc' },
      select: traineeWithMentor,
    }) as Promise<TraineeWithMentor[]>;

  /** Active MENTOR accounts are the only valid assignment targets. */
  findAssignableMentor = (id: string) =>
    prisma.admin.findFirst({
      where: { id, role: 'MENTOR', is_active: true },
      select: { id: true },
    });

  /**
   * Validates the trainee and target staff account, then writes the assignment in one
   * transaction. A single SQL update makes assignment, reassignment, and unassignment
   * atomic; the transaction prevents racing a deactivation or role change.
   */
  assignMentor = (traineeId: string, mentorId: string | null): Promise<AssignMentorOutcome> =>
    prisma.$transaction(async (tx) => {
      const trainee = await tx.trainee.findUnique({
        where: { id: traineeId },
        select: { id: true, mentor_id: true },
      });
      if (!trainee) return { status: 'trainee-not-found' };

      if (mentorId === null) {
        return {
          status: 'assigned',
          trainee: await tx.trainee.update({
            where: { id: traineeId },
            data: { mentor_id: null },
            select: traineeWithMentor,
          }),
        };
      }

      const mentor = await tx.admin.findUnique({
        where: { id: mentorId },
        select: { id: true, role: true, is_active: true },
      });
      if (!mentor) return { status: 'mentor-not-found' };
      if (mentor.role !== 'MENTOR' || !mentor.is_active) return { status: 'mentor-invalid' };
      if (trainee.mentor_id === mentorId) return { status: 'already-assigned' };

      return {
        status: 'assigned',
        trainee: await tx.trainee.update({
          where: { id: traineeId },
          data: { mentor_id: mentorId },
          select: traineeWithMentor,
        }),
      };
    });
}
