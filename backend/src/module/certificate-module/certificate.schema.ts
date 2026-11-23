import { z } from 'zod';

export const certificateIdParamsSchema = z.object({
  certificateId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^VK-[A-F0-9]{20}$/, 'Invalid certificate ID format.'),
});

export type CertificateIdParams = z.infer<typeof certificateIdParamsSchema>;
