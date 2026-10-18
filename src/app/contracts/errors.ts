import { z } from 'zod';

export const ApiErrorSchema = z.object({
  code: z.enum([
    'NOT_FOUND',
    'BAD_REQUEST',
    'CONFLICT',
    'INVALID_THROUGH_VERSION',
    'SUMMARY_NOT_READY',
  ]),
  message: z.string(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
