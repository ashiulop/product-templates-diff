import { z } from 'zod';

export const DemoPublishRequestSchema = z.object({ templateId: z.string() });
export type DemoPublishRequest = z.infer<typeof DemoPublishRequestSchema>;

export const DemoPublishResponseSchema = z.object({
  templateId: z.string(),
  version: z.int().min(1),
});
export type DemoPublishResponse = z.infer<typeof DemoPublishResponseSchema>;

export const DemoColleagueRequestSchema = z.object({
  engagementId: z.string(),
  decision: z.enum(['apply', 'decline']),
});
export type DemoColleagueRequest = z.infer<typeof DemoColleagueRequestSchema>;
