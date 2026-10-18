import { z } from 'zod';

export const DiffEntrySchema = z.object({
  id: z.string().min(1),
  op: z.enum(['add', 'remove', 'replace']),
  path: z.string().min(1),
  before: z.unknown().optional(),
  after: z.unknown().optional(),
});
export type DiffEntry = z.infer<typeof DiffEntrySchema>;

export const ChangeItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  explanation: z.string(),
  category: z.enum(['added', 'removed', 'changed-requirement', 'wording-only']),
  diffRefs: z.array(z.string()).min(1),
});
export type ChangeItem = z.infer<typeof ChangeItemSchema>;

export const VersionSummarySchema = z
  .discriminatedUnion('status', [
    z.object({
      templateId: z.string(),
      version: z.int().min(1),
      status: z.literal('preparing'),
    }),
    z.object({
      templateId: z.string(),
      version: z.int().min(1),
      status: z.literal('ready'),
      source: z.enum(['llm', 'rule-based']),
      items: z.array(ChangeItemSchema),
      diff: z.array(DiffEntrySchema),
    }),
  ])
  .superRefine((summary, ctx) => {
    if (summary.status !== 'ready') {
      return;
    }
    const seen = new Set<string>();
    summary.diff.forEach((entry, i) => {
      if (seen.has(entry.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate diff id "${entry.id}"`,
          path: ['diff', i, 'id'],
        });
      }
      seen.add(entry.id);
    });
    summary.items.forEach((item, i) => {
      item.diffRefs.forEach((ref, j) => {
        if (!seen.has(ref)) {
          ctx.addIssue({
            code: 'custom',
            message: `diffRef "${ref}" does not exist in diff`,
            path: ['items', i, 'diffRefs', j],
          });
        }
      });
    });
  });
export type VersionSummary = z.infer<typeof VersionSummarySchema>;
