import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { type EngagementStatus, EngagementStatusSchema, VersionSummarySchema } from '../contracts';
import { provideFakeBackend } from './provide-fake-backend';
import { createPublishedSummary, createSeed } from './seed';
import { FakeBackendStore } from './store';

describe('seed contract', () => {
  const seed = createSeed();

  const served = (): EngagementStatus[] => {
    const listed = TestBed.inject(FakeBackendStore).listEngagements();
    return listed.ok ? listed.value : [];
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideFakeBackend({ latencyMs: 0 })] });
  });

  it('the store serves every seed engagement', () => {
    expect(served().map((s) => s.engagementId)).toEqual(seed.engagements.map((e) => e.engagementId));
  });

  it.each(seed.engagements.map((e) => e.engagementId))(
    'status served for %s passes EngagementStatusSchema',
    (id) => {
      const status = served().find((s) => s.engagementId === id);
      expect(EngagementStatusSchema.safeParse(status).success).toBe(true);
    },
  );

  const summaries = [
    ...[...seed.templates.values()].flatMap((t) => [...t.summaries.values()]),
    createPublishedSummary('T-AUDIT', 7),
  ];

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
