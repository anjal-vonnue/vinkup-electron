import { prisma } from '../../lib/prisma.js';

export class AuthRepository {
  /** Only active trainees can sign in or keep a session. */
  findBymail = (email: string) => {
    return prisma.trainee.findFirst({
      where: { email: email.toLowerCase(), is_active: true },
    });
  };

  findById = (id: string) => {
    return prisma.trainee.findFirst({ where: { id, is_active: true } });
  };

  findActiveTraineeById = (id: string) =>
    prisma.trainee.findFirst({
      where: { id, is_active: true },
      select: { id: true },
    });

  findActiveStaffByEmail = (email: string) =>
    prisma.admin.findFirst({
      where: {
        email: email.toLowerCase(),
        is_active: true,
      },
      select: { id: true, email: true, name: true, role: true },
    });

  findActiveStaffById = (id: string) =>
    prisma.admin.findFirst({
      where: { id, is_active: true },
      select: { id: true, role: true },
    });

  /** The trainee's assigned mentor, or null for an unknown or unassigned trainee. */
  findTraineeMentorById = (id: string) =>
    prisma.trainee.findUnique({
      where: { id },
      select: { mentor_id: true },
    });

  findActiveAdminByEmail = (email: string) => this.findActiveStaffByEmail(email);

  findActiveAdminById = (id: string) => this.findActiveStaffById(id);

  recordAdminLogin = (id: string) =>
    prisma.admin.update({
      where: { id },
      data: { last_login_at: new Date() },
    });
}
