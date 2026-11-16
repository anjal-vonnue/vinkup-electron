import { prisma } from '../../lib/prisma';

const traineeWithMentor = {
  id: true,
  name: true,
  email: true,
  mentor: { select: { id: true, name: true, email: true } },
} as const;

export type AssignMentorOutcome =
  | { status: 'assigned'; trainee: TraineeWithMentor }
  | { status: 'trainee-not-found' }
  | { status: 'mentor-not-found' }
  | { status: 'mentor-invalid' }
  | { status: 'already-assigned' };

export type TraineeWithMentor = {
  id: string;
  name: string;
  email: string;
  mentor: { id: string; name: string; email: string } | null;
};

export class ManagerRepository {
  listStaff = () =>
    prisma.admin.findMany({
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        is_active: true,
        created_at: true,
        last_login_at: true,
        _count: { select: { assigned_trainees: true } },
      },
    });

  listTraineesWithMentor = () =>
    prisma.trainee.findMany({
      orderBy: { name: 'asc' },
      select: traineeWithMentor,
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
