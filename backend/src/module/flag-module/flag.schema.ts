import z from 'zod';
import { flag_event_type } from '../../generated/prisma/enums';

const MAX_CONTEXT_KEYS = 10;

export const taskIdParamsSchema = z.object({
  taskId: z.string().min(1).max(100),
});

export const logFlagEventSchema = z
  .object({
    type: z.enum(flag_event_type),
    durationMs: z.number().int().min(0).optional(),
    context: z
      .record(z.string().max(50), z.union([z.string().max(200), z.number(), z.boolean()]))
      .refine((context) => Object.keys(context).length <= MAX_CONTEXT_KEYS, {
        message: `context can have at most ${MAX_CONTEXT_KEYS} keys.`,
      })
      .optional(),
  })
  // An idle flag is only useful with its length ("Idle for 18 min").
  .refine((body) => body.type !== 'IDLE' || body.durationMs !== undefined, {
    message: 'durationMs is required for IDLE.',
    path: ['durationMs'],
  });

export type LogFlagType = z.infer<typeof logFlagEventSchema>;
export type CreateFlagData = z.infer<typeof taskIdParamsSchema> & LogFlagType;
