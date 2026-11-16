import { z } from 'zod';

export const traineeIdParamsSchema = z.object({ traineeId: z.string().uuid() });

export const assignMentorSchema = z.object({
  mentorId: z.string().uuid().nullable(),
});

export type AssignMentorBody = z.infer<typeof assignMentorSchema>;
