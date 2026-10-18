import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { EngagementStatusSchema, VersionSummarySchema } from '../contracts';
import { provideFakeBackend } from './provide-fake-backend';
import { createSeed } from './seed';
import { FakeBackendStore } from './store';

describe('seed contract', () => {
  const seed = createSeed();

  TestBed.configureTestingModule({ providers: [provideFakeBackend({ latencyMs: 0 })] });
  const listed = TestBed.inject(FakeBackendStore).listEngagements();
  const statuses = (listed.ok ? listed.value : []).map((s) => [s.engagementId, s] as const);

  it('the store serves every seed engagement', () => {
    expect(statuses.map(([id]) => id)).toEqual(seed.engagements.map((e) => e.engagementId));
  });

  it.each(statuses)('status served for %s passes EngagementStatusSchema', (_id, status) => {
    expect(EngagementStatusSchema.safeParse(status).success).toBe(true);
  });

  const summaries = [...seed.templates.values()].flatMap((t) => [...t.summaries.values()]);

  it.each(summaries.map((s) => [`${s.templateId} v${s.version}`, s] as const))(
    'summary %s passes VersionSummarySchema',
    (_name, summary) => {
      expect(VersionSummarySchema.safeParse(summary).success).toBe(true);
    },
  );

  it('covers a removed item, a wording-only replace and a two-ref item', () => {
    const items = summaries.flatMap((s) =>
      s.status === 'ready' ? s.items.map((item) => ({ item, diff: s.diff })) : [],
    );
    expect(items.some(({ item }) => item.category === 'removed')).toBe(true);
    expect(
      items.some(
        ({ item, diff }) =>
          item.category === 'wording-only' &&
          item.diffRefs.some((ref) => diff.find((d) => d.id === ref)?.op === 'replace'),
      ),
    ).toBe(true);
    expect(items.some(({ item }) => item.diffRefs.length === 2)).toBe(true);
  });

  it('returns fresh data: mutating one result does not affect the next call', () => {
    const first = createSeed();
    first.rows[0].revision = 99;
    const summary = first.templates.get('T-TAX')?.summaries.get(2);
    if (summary?.status === 'ready') {
      summary.items.length = 0;
    }
    const second = createSeed();
    expect(second.rows[0].revision).toBe(1);
    const again = second.templates.get('T-TAX')?.summaries.get(2);
    expect(again?.status === 'ready' && again.items.length).toBe(1);
  });
});
