import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngagementStatus } from '../contracts';
import { DecisionResult, EngagementApi } from './engagement-api';

const status: EngagementStatus = {
  engagementId: 'e1',
  engagementName: 'Acme',
  templateId: 't1',
  templateName: 'Template',
  state: 'up-to-date',
  currentVersion: 2,
  declinedThroughVersion: null,
  latestVersion: 2,
  revision: 3,
};
const decision = { decision: 'apply', throughVersion: 2, expectedRevision: 2 } as const;
const error = (code: string) => ({ code, message: 'x' });

describe('EngagementApi', () => {
  let api: EngagementApi;
  let httpTesting: HttpTestingController;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(EngagementApi);
    httpTesting = TestBed.inject(HttpTestingController);
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    httpTesting.verify();
    consoleError.mockRestore();
  });

  describe('decide', () => {
    type Reply = { body: object; status: number } | 'network-error';
    const cases: [string, Reply, DecisionResult, boolean][] = [
      ['200 -> ok', { body: status, status: 200 }, { kind: 'ok', status }, false],
      ['409 -> conflict', { body: error('CONFLICT'), status: 409 }, { kind: 'conflict' }, false],
      [
        '422 -> rejected with the code',
        { body: error('SUMMARY_NOT_READY'), status: 422 },
        { kind: 'rejected', code: 'SUMMARY_NOT_READY' },
        false,
      ],
      [
        '400 -> rejected BAD_REQUEST',
        { body: error('BAD_REQUEST'), status: 400 },
        { kind: 'rejected', code: 'BAD_REQUEST' },
        false,
      ],
      ['404 -> not-found', { body: error('NOT_FOUND'), status: 404 }, { kind: 'not-found' }, false],
      [
        'malformed 200 -> contract',
        { body: { nope: true }, status: 200 },
        { kind: 'contract' },
        true,
      ],
      [
        'malformed error body -> contract',
        { body: { nope: true }, status: 409 },
        { kind: 'contract' },
        true,
      ],
      [
        'unexpected code on 422 -> contract',
        { body: error('CONFLICT'), status: 422 },
        { kind: 'contract' },
        true,
      ],
      ['500 -> network', { body: error('BAD_REQUEST'), status: 500 }, { kind: 'network' }, false],
      ['status 0 -> network', 'network-error', { kind: 'network' }, false],
    ];

    it.each(cases)('%s', async (_name, reply, expected, logs) => {
      const result = api.decide('e 1', decision);
      const req = httpTesting.expectOne('/api/engagements/e%201/decision');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(decision);
      if (reply === 'network-error') {
        req.error(new ProgressEvent('error'));
      } else {
        const ok = reply.status >= 200 && reply.status < 300;
        req.flush(
          reply.body,
          ok
            ? { status: reply.status, statusText: 'OK' }
            : { status: reply.status, statusText: 'Err' },
        );
      }
      expect(await result).toEqual(expected);
      if (logs) {
        expect(consoleError).toHaveBeenCalledWith('[contract]', expect.anything());
      } else {
        expect(consoleError).not.toHaveBeenCalled();
      }
    });
  });

  describe('reads', () => {
    it('ends in error and logs when the body violates the contract', async () => {
      const resource = api.engagements(TestBed.inject(Injector));
      TestBed.tick();
      httpTesting.expectOne('/api/engagements').flush([{ nope: true }]);
      await TestBed.inject(ApplicationRef).whenStable();
      expect(resource.status()).toBe('error');
      expect(consoleError).toHaveBeenCalledWith('[contract]', expect.anything());
    });
  });
});
