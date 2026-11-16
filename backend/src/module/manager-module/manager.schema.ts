import { z } from 'zod';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Enter the full name.')
  .max(80, 'Keep the name under 80 characters.');

// Lower-cased here, so every later check and the stored value use the same form.
const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254);

export const staffIdParamsSchema = z.object({ staffId: z.string().uuid() });
export const traineeIdParamsSchema = z.object({ traineeId: z.string().uuid() });

export const staffRoleSchema = z.enum(['mentor', 'manager']);

export const createStaffSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: staffRoleSchema,
});

export const updateStaffSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
    role: staffRoleSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');

export const createTraineeSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  mentorId: z.string().uuid().nullable().optional(),
});

export const updateTraineeSchema = z
  .object({
    name: nameSchema.optional(),
    email: emailSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update.');

export const accountStatusSchema = z.object({ isActive: z.boolean() });

export const assignMentorSchema = z.object({
  mentorId: z.string().uuid().nullable(),
});

export type CreateStaffBody = z.infer<typeof createStaffSchema>;
export type UpdateStaffBody = z.infer<typeof updateStaffSchema>;
export type CreateManagerTraineeBody = z.infer<typeof createTraineeSchema>;
export type UpdateManagerTraineeBody = z.infer<typeof updateTraineeSchema>;
export type AccountStatusBody = z.infer<typeof accountStatusSchema>;
export type AssignMentorBody = z.infer<typeof assignMentorSchema>;
