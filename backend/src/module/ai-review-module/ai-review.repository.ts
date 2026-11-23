import { prisma } from '../../lib/prisma';

class AiReviewRepository {
  listPrompts = (adminId: string) =>
    prisma.review_prompt.findMany({
      where: { admin_id: adminId },
      orderBy: { updated_at: 'desc' },
    });

  findPrompt = (adminId: string, id: string) =>
    prisma.review_prompt.findFirst({ where: { id, admin_id: adminId } });

  findPromptByName = (adminId: string, name: string, excludeId?: string) =>
    prisma.review_prompt.findFirst({
      where: { admin_id: adminId, name, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    });

  createPrompt = (adminId: string, data: { name: string; content: string }) =>
    prisma.review_prompt.create({ data: { admin_id: adminId, ...data } });

  updatePrompt = (id: string, data: { name?: string; content?: string }) =>
    prisma.review_prompt.update({ where: { id }, data });

  deletePrompt = (id: string) => prisma.review_prompt.delete({ where: { id } });
}

export const aiReviewRepository = new AiReviewRepository();
