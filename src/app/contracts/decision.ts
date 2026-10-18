import * as z from 'zod';

export const UpdateDecisionSchema = z.object({
  decision: z.enum(['apply', 'decline']),
  throughVersion: z.int().min(1),
  expectedRevision: z.int().min(1),
});
export type UpdateDecision = z.infer<typeof UpdateDecisionSchema>;
