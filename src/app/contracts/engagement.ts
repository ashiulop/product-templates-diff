import * as z from 'zod';

export const IdentitySchema = z.object({
  engagementId: z.string(),
  engagementName: z.string(),
  templateId: z.string(),
  templateName: z.string(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const TrackedSchema = IdentitySchema.extend({
  currentVersion: z.int().min(1),
  declinedThroughVersion: z.int().min(1).nullable(),
  latestVersion: z.int().min(1),
  revision: z.int().min(1),
});
export type Tracked = z.infer<typeof TrackedSchema>;

export const EngagementStatusSchema = z
  .discriminatedUnion('state', [
    IdentitySchema.extend({ state: z.literal('not-yet-checked') }),
    TrackedSchema.extend({ state: z.literal('up-to-date') }),
    TrackedSchema.extend({ state: z.literal('declined') }),
    TrackedSchema.extend({
      state: z.literal('update-pending'),
      pendingCount: z.int().min(1),
    }),
  ])
  .superRefine((status, ctx) => {
    if (status.state === 'not-yet-checked') {
      return;
    }
    if (status.currentVersion > status.latestVersion) {
      ctx.addIssue({
        code: 'custom',
        message: 'currentVersion must not exceed latestVersion',
        path: ['currentVersion'],
      });
    }
    if (status.state === 'up-to-date' && status.currentVersion !== status.latestVersion) {
      ctx.addIssue({
        code: 'custom',
        message: 'up-to-date requires currentVersion to equal latestVersion',
        path: ['currentVersion'],
      });
    }
    if (
      status.state === 'update-pending' &&
      status.pendingCount !== status.latestVersion - status.currentVersion
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'pendingCount must equal latestVersion minus currentVersion',
        path: ['pendingCount'],
      });
    }
  });
export type EngagementStatus = z.infer<typeof EngagementStatusSchema>;
