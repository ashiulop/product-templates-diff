import {
  HttpErrorResponse,
  HttpParams,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EngagementStatus, VersionSummary } from '../contracts';
import { fakeBackendInterceptor } from './interceptor';
import { provideFakeBackend } from './provide-fake-backend';
import { FakeBackendStore } from './store';

describe('fake backend integration', () => {
  let http: HttpClient;

  const get = <T>(url: string) => firstValueFrom(http.get<T>(url));
  const post = <T>(url: string, body?: unknown) => firstValueFrom(http.post<T>(url, body));
  const failure = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        return e;
      }
      throw e;
    }
    throw new Error('Expected the request to fail');
  };
  const decision = (
    decision: 'apply' | 'decline',
    throughVersion: number,
    expectedRevision: number,
  ) => ({
    decision,
    throughVersion,
    expectedRevision,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([fakeBackendInterceptor])),
        provideFakeBackend({ latencyMs: 0 }),
      ],
    });
    http = TestBed.inject(HttpClient);
  });

  it('lists all eight engagements', async () => {
    const list = await get<EngagementStatus[]>('/api/engagements');
    expect(list.map((e) => e.engagementId)).toEqual([
      'E-001',
      'E-002',
      'E-003',
      'E-004',
      'E-005',
      'E-006',
      'E-007',
      'E-008',
    ]);
  });

  it.each([
    [
      'E-003',
      {
        state: 'update-pending',
        pendingCount: 3,
        currentVersion: 3,
        declinedThroughVersion: 5,
        latestVersion: 6,
        revision: 2,
      },
    ],
    [
      'E-004',
      {
        state: 'declined',
        currentVersion: 3,
        declinedThroughVersion: 6,
        latestVersion: 6,
        revision: 2,
      },
    ],
    [
      'E-005',
      {
        state: 'update-pending',
        pendingCount: 2,
        currentVersion: 1,
        latestVersion: 3,
        revision: 1,
      },
    ],
    ['E-006', { state: 'not-yet-checked', templateId: 'T-ICR' }],
  ])('serves the seed state for %s', async (id, expected) => {
    const status = await get<EngagementStatus>(`/api/engagements/${id}`);
    expect(status).toMatchObject(expected);
  });

  it('returns 404 NOT_FOUND for an unknown engagement', async () => {
    const error = await failure(get('/api/engagements/E-999'));
    expect(error.status).toBe(404);
    expect(error.error.code).toBe('NOT_FOUND');
  });

  describe('changes', () => {
    it('returns summaries after N through latest, ascending', async () => {
      const list = await get<VersionSummary[]>('/api/templates/T-AUDIT/changes?after=3');
      expect(list.map((s) => s.version)).toEqual([4, 5, 6]);
    });

    it('accepts HttpParams', async () => {
      const list = await firstValueFrom(
        http.get<VersionSummary[]>('/api/templates/T-AUDIT/changes', {
          params: new HttpParams().set('after', 4),
        }),
      );
      expect(list.map((s) => s.version)).toEqual([5, 6]);
    });

    it('returns every summary for after=1 and none past latest', async () => {
      expect((await get<VersionSummary[]>('/api/templates/T-TAX/changes?after=1')).length).toBe(1);
      expect(await get<VersionSummary[]>('/api/templates/T-TAX/changes?after=2')).toEqual([]);
      expect(await get<VersionSummary[]>('/api/templates/T-TAX/changes?after=9')).toEqual([]);
    });

    it('returns the preparing summary as preparing', async () => {
      const list = await get<VersionSummary[]>('/api/templates/T-ICR/changes?after=2');
      expect(list).toEqual([{ templateId: 'T-ICR', version: 3, status: 'preparing' }]);
    });

    it.each([
      ['missing', ''],
      ['negative', '?after=-1'],
      ['fractional', '?after=1.5'],
      ['non-numeric', '?after=abc'],
      ['empty', '?after='],
    ])('rejects a %s after with 400, even for an unknown template', async (_n, query) => {
      for (const template of ['T-AUDIT', 'T-NOPE']) {
        const error = await failure(get(`/api/templates/${template}/changes${query}`));
        expect(error.status).toBe(400);
        expect(error.error.code).toBe('BAD_REQUEST');
      }
    });

    it('returns 404 for an unknown template', async () => {
      const error = await failure(get('/api/templates/T-NOPE/changes?after=1'));
      expect(error.status).toBe(404);
      expect(error.error.code).toBe('NOT_FOUND');
    });
  });

  describe('decisions', () => {
    it('applies a decision and returns the updated status', async () => {
      const status = await post<EngagementStatus>(
        '/api/engagements/E-002/decision',
        decision('apply', 6, 1),
      );
      expect(status).toMatchObject({ state: 'up-to-date', currentVersion: 6, revision: 2 });
      expect(await get('/api/engagements/E-002')).toEqual(status);
    });

    it('returns 409 on a stale revision', async () => {
      const error = await failure(post('/api/engagements/E-003/decision', decision('apply', 4, 1)));
      expect(error.status).toBe(409);
      expect(error.error.code).toBe('CONFLICT');
    });

    it("a colleague's decline is not silently overwritten", async () => {
      const declined = await post<EngagementStatus>('/api/_demo/colleague-decides', {
        engagementId: 'E-003',
        decision: 'decline',
      });
      expect(declined).toMatchObject({ state: 'declined', declinedThroughVersion: 6, revision: 3 });

      const error = await failure(post('/api/engagements/E-003/decision', decision('apply', 6, 2)));
      expect(error.status).toBe(409);
      expect(error.error.code).toBe('CONFLICT');
      expect(await get('/api/engagements/E-003')).toMatchObject({ state: 'declined', revision: 3 });
    });

    it('returns 422 SUMMARY_NOT_READY for a preparing version', async () => {
      const error = await failure(post('/api/engagements/E-005/decision', decision('apply', 3, 1)));
      expect(error.status).toBe(422);
      expect(error.error.code).toBe('SUMMARY_NOT_READY');
    });

    it('returns 422 INVALID_THROUGH_VERSION out of range', async () => {
      const error = await failure(post('/api/engagements/E-002/decision', decision('apply', 7, 1)));
      expect(error.status).toBe(422);
      expect(error.error.code).toBe('INVALID_THROUGH_VERSION');
    });

    it('returns 404 for an engagement without a row and for an unknown one', async () => {
      for (const id of ['E-006', 'E-999']) {
        const error = await failure(
          post(`/api/engagements/${id}/decision`, decision('apply', 2, 1)),
        );
        expect(error.status).toBe(404);
        expect(error.error.code).toBe('NOT_FOUND');
      }
    });

    it.each([
      ['no body', undefined],
      ['an unknown decision', { decision: 'skip', throughVersion: 2, expectedRevision: 1 }],
      ['a missing field', { decision: 'apply', throughVersion: 2 }],
      ['a zero version', { decision: 'apply', throughVersion: 0, expectedRevision: 1 }],
    ])('returns 400 BAD_REQUEST for %s', async (_n, body) => {
      const error = await failure(post('/api/engagements/E-002/decision', body));
      expect(error.status).toBe(400);
      expect(error.error.code).toBe('BAD_REQUEST');
    });
  });

  describe('demo endpoints', () => {
    it('publish gives a preparing summary, markReady makes it ready, and latest moves', async () => {
      const published = await post('/api/_demo/publish', { templateId: 'T-TAX' });
      expect(published).toEqual({ templateId: 'T-TAX', version: 3 });

      expect(await get('/api/engagements/E-007')).toMatchObject({
        latestVersion: 3,
        pendingCount: 2,
      });
      expect(await get('/api/templates/T-TAX/changes?after=2')).toEqual([
        { templateId: 'T-TAX', version: 3, status: 'preparing' },
      ]);

      const marked = TestBed.inject(FakeBackendStore).markReady('T-TAX', 3);
      expect(marked.ok).toBe(true);
      const [summary] = await get<VersionSummary[]>('/api/templates/T-TAX/changes?after=2');
      expect(summary).toMatchObject({ version: 3, status: 'ready', source: 'llm' });
    });

    it('publish validates the body and the template', async () => {
      const bad = await failure(post('/api/_demo/publish', {}));
      expect(bad.status).toBe(400);
      expect(bad.error.code).toBe('BAD_REQUEST');
      const missing = await failure(post('/api/_demo/publish', { templateId: 'T-NOPE' }));
      expect(missing.status).toBe(404);
    });

    it('colleague-decides validates the body and the engagement', async () => {
      const bad = await failure(post('/api/_demo/colleague-decides', { engagementId: 'E-001' }));
      expect(bad.status).toBe(400);
      const missing = await failure(
        post('/api/_demo/colleague-decides', { engagementId: 'E-999', decision: 'apply' }),
      );
      expect(missing.status).toBe(404);
    });

    it('reset restores the seed and returns 204', async () => {
      await post('/api/engagements/E-002/decision', decision('apply', 6, 1));
      await post('/api/_demo/publish', { templateId: 'T-AUDIT' });

      const response = await firstValueFrom(
        http.post('/api/_demo/reset', null, { observe: 'response' }),
      );
      expect(response.status).toBe(204);
      expect(response.body).toBeNull();

      expect(await get('/api/engagements/E-002')).toMatchObject({
        state: 'update-pending',
        currentVersion: 5,
        latestVersion: 6,
        revision: 1,
      });
    });
  });

  it('does not let a mutated response change the next response', async () => {
    const first = await get<EngagementStatus[]>('/api/engagements');
    first[0].engagementName = 'Tampered';
    first.pop();
    const second = await get<EngagementStatus[]>('/api/engagements');
    expect(second).toHaveLength(8);
    expect(second[0].engagementName).toBe('Acme Manufacturing FY2026');

    const changes = await get<VersionSummary[]>('/api/templates/T-TAX/changes?after=1');
    if (changes[0].status === 'ready') {
      changes[0].items.length = 0;
    }
    const again = await get<VersionSummary[]>('/api/templates/T-TAX/changes?after=1');
    expect(again[0].status === 'ready' && again[0].items.length).toBe(1);
  });

  describe('unknown routes', () => {
    it.each([
      ['GET', '/api/nope'],
      ['GET', '/api'],
      ['GET', '/api/engagements/E-001/decision'],
      ['DELETE', '/api/engagements/E-001'],
      ['POST', '/api/engagements'],
      ['GET', '/api/_demo/reset'],
      ['POST', '/api/_demo/unknown'],
    ])('%s %s returns 404 NOT_FOUND', async (method, url) => {
      const error = await failure(firstValueFrom(http.request(method, url, { body: {} })));
      expect(error.status).toBe(404);
      expect(error.error.code).toBe('NOT_FOUND');
    });
  });
});
