import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  EngagementStatus,
  EngagementStatusSchema,
  VersionSummary,
  VersionSummarySchema,
} from '../../contracts';
import { DecisionResult } from '../../data/engagement-api';
import { decisionOutcome, rangeLabel, ReviewPage } from './review.page';

describe('decisionOutcome', () => {
  const cases: [string, DecisionResult, 'apply' | 'decline', object][] = [
    [
      'ok apply',
      { kind: 'ok', status: {} as EngagementStatus },
      'apply',
      { role: 'status', text: 'Applied through v6', offerReload: false, reloadNow: true },
    ],
    [
      'ok decline',
      { kind: 'ok', status: {} as EngagementStatus },
      'decline',
      { role: 'status', text: 'Declined through v6', offerReload: false, reloadNow: true },
    ],
    [
      'conflict',
      { kind: 'conflict' },
      'apply',
      {
        role: 'alert',
        text: 'Someone else decided on this engagement. Reload to see the latest.',
        offerReload: true,
        reloadNow: false,
      },
    ],
    [
      'rejected',
      { kind: 'rejected', code: 'SUMMARY_NOT_READY' },
      'decline',
      {
        role: 'alert',
        text: 'This decision is no longer valid. Reload to see the latest.',
        offerReload: true,
        reloadNow: false,
      },
    ],
    [
      'not-found',
      { kind: 'not-found' },
      'apply',
      {
        role: 'alert',
        text: 'This engagement no longer exists.',
        offerReload: false,
        reloadNow: false,
      },
    ],
    [
      'contract',
      { kind: 'contract' },
      'apply',
      {
        role: 'alert',
        text: 'Something went wrong. Try again.',
        offerReload: false,
        reloadNow: false,
      },
    ],
    [
      'network',
      { kind: 'network' },
      'decline',
      {
        role: 'alert',
        text: 'Something went wrong. Try again.',
        offerReload: false,
        reloadNow: false,
      },
    ],
  ];

  it.each(cases)('%s', (_name, result, decision, expected) => {
    expect(decisionOutcome(result, decision, 6)).toEqual(expected);
  });
});

describe('rangeLabel', () => {
  const cases: [string, number, number | null, string][] = [
    ['no decidable version', 3, null, ''],
    ['single version', 3, 4, ' v4'],
    ['range uses an en dash (U+2013)', 3, 6, ' v4\u2013v6'],
  ];

  it.each(cases)('%s', (_name, current, through, expected) => {
    expect(rangeLabel(current, through)).toBe(expected);
  });
});

describe('ReviewPage', () => {
  function setup(status: EngagementStatus, summaries: VersionSummary[]) {
    expect(EngagementStatusSchema.safeParse(status).success).toBe(true);
    for (const summary of summaries) {
      expect(VersionSummarySchema.safeParse(summary).success).toBe(true);
    }
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    const httpTesting = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReviewPage);
    fixture.componentRef.setInput('engagementId', status.engagementId);
    return { fixture, httpTesting };
  }

  async function settle(fixture: ReturnType<typeof setup>['fixture']) {
    await Promise.resolve();
    TestBed.tick();
    fixture.detectChanges();
  }

  async function load(
    fixture: ReturnType<typeof setup>['fixture'],
    httpTesting: HttpTestingController,
    status: EngagementStatus,
    summaries: VersionSummary[],
  ) {
    fixture.detectChanges();
    httpTesting.expectOne(`/api/engagements/${status.engagementId}`).flush(status);
    await settle(fixture);
    httpTesting
      .expectOne((r) => r.url.endsWith('/changes') && r.params.get('after') === '5')
      .flush(summaries);
    await fixture.whenStable();
  }

  const ready = (version: number): VersionSummary => ({
    templateId: 'T-AUDIT',
    version,
    status: 'ready',
    source: 'llm',
    items: [
      {
        id: 'i1',
        title: 'New clause',
        explanation: 'A clause was added.',
        category: 'added',
        diffRefs: ['d1'],
      },
    ],
    diff: [{ id: 'd1', op: 'add', path: '/clauses/9', after: 'x' }],
  });

  it('shows the conflict alert on a 409 and makes no second POST', async () => {
    const status: EngagementStatus = {
      engagementId: 'E-002',
      engagementName: 'Brightline Retail FY2026',
      templateId: 'T-AUDIT',
      templateName: 'Statutory Audit (EU)',
      state: 'update-pending',
      currentVersion: 5,
      declinedThroughVersion: null,
      latestVersion: 6,
      revision: 1,
      pendingCount: 1,
    };
    const summaries = [ready(6)];
    const { fixture, httpTesting } = setup(status, summaries);
    await load(fixture, httpTesting, status, summaries);

    const element: HTMLElement = fixture.nativeElement;
    const apply = Array.from(element.querySelectorAll('button')).find(
      (b) => b.textContent.trim() === 'Apply v6',
    );
    expect(apply).toBeDefined();
    apply?.click();

    const post = httpTesting.expectOne('/api/engagements/E-002/decision');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      decision: 'apply',
      throughVersion: 6,
      expectedRevision: 1,
    });
    post.flush(
      { code: 'CONFLICT', message: 'Revision mismatch' },
      { status: 409, statusText: 'Conflict' },
    );
    await fixture.whenStable();

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(
      'Someone else decided on this engagement. Reload to see the latest.',
    );
    expect(
      Array.from(alert?.querySelectorAll('button') ?? []).some(
        (b) => b.textContent.trim() === 'Reload',
      ),
    ).toBe(true);
    expect(httpTesting.match({ method: 'POST' })).toHaveLength(0);
    httpTesting.verify();
  });

  it('stops decisions at the last ready version when a later one is preparing', async () => {
    const status: EngagementStatus = {
      engagementId: 'E-005',
      engagementName: 'Evergreen Foods FY2026',
      templateId: 'T-ICR',
      templateName: 'Internal Controls Review',
      state: 'update-pending',
      currentVersion: 1,
      declinedThroughVersion: null,
      latestVersion: 3,
      revision: 1,
      pendingCount: 2,
    };
    const summaries: VersionSummary[] = [
      { ...ready(2), templateId: 'T-ICR' },
      { templateId: 'T-ICR', version: 3, status: 'preparing' },
    ];
    const { fixture, httpTesting } = setup(status, summaries);
    fixture.detectChanges();
    httpTesting.expectOne('/api/engagements/E-005').flush(status);
    await settle(fixture);
    httpTesting
      .expectOne((r) => r.url.endsWith('/T-ICR/changes') && r.params.get('after') === '1')
      .flush(summaries);
    await fixture.whenStable();

    const element: HTMLElement = fixture.nativeElement;
    const text = element.textContent.replace(/\s+/g, ' ');
    const buttons = Array.from(element.querySelectorAll('button')).map((b) => b.textContent.trim());
    expect(buttons).toContain('Apply v2');
    const cards = Array.from(element.querySelectorAll('li.card'));
    const cardFor = (heading: string) =>
      cards.find((c) => c.querySelector('h3')?.textContent.trim() === heading);
    expect(cardFor('v3')?.textContent).toContain('Summary being prepared…');
    expect(cardFor('v2')).toBeDefined();
    expect(cardFor('v2')?.textContent).not.toContain('Summary being prepared…');
    expect(text).toContain('Decisions stop at v2: the summary of v3 is still being prepared.');
    httpTesting.verify();
  });
});
