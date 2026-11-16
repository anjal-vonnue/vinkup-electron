import { prisma } from '../../lib/prisma';

export class AuthRepository {
  findBymail = (email: string) => {
    return prisma.trainee.findUnique({ where: { email: email.toLowerCase() } });
  };

  findById = (id: string) => {
    return prisma.trainee.findUnique({ where: { id } });
  };

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

  findActiveAdminByEmail = (email: string) => this.findActiveStaffByEmail(email);

  findActiveAdminById = (id: string) => this.findActiveStaffById(id);

  recordAdminLogin = (id: string) =>
    prisma.admin.update({
      where: { id },
      data: { last_login_at: new Date() },
    });
}
