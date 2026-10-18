import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngagementStatus } from '../contracts';
import { provideFakeBackend } from './provide-fake-backend';
import { FakeBackendStore } from './store';

function setup(summaryReadyDelayMs = 3000): FakeBackendStore {
  TestBed.configureTestingModule({
    providers: [provideFakeBackend({ latencyMs: 0, summaryReadyDelayMs })],
  });
  return TestBed.inject(FakeBackendStore);
}

describe('FakeBackendStore colleagueDecides', () => {
  type Expected =
    | { ok: true; state: EngagementStatus['state']; currentVersion?: number; declined?: number }
    | { ok: false; status: number; code: string };

  it.each<[string, string, 'apply' | 'decline', Expected]>([
    [
      'E-003 apply goes through v6',
      'E-003',
      'apply',
      { ok: true, state: 'up-to-date', currentVersion: 6 },
    ],
    [
      'E-005 goes through v2 only (v3 is preparing)',
      'E-005',
      'apply',
      { ok: true, state: 'update-pending', currentVersion: 2 },
    ],
    [
      'E-002 decline goes through v6',
      'E-002',
      'decline',
      { ok: true, state: 'declined', declined: 6 },
    ],
    [
      'up-to-date E-001 has nothing ready',
      'E-001',
      'apply',
      { ok: false, status: 422, code: 'SUMMARY_NOT_READY' },
    ],
    [
      'E-004 decline fails the range check',
      'E-004',
      'decline',
      { ok: false, status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    ['E-006 has no row', 'E-006', 'apply', { ok: false, status: 404, code: 'NOT_FOUND' }],
    ['unknown engagement', 'E-999', 'apply', { ok: false, status: 404, code: 'NOT_FOUND' }],
  ])('%s', (_name, id, decision, expected) => {
    const store = setup();
    const result = store.colleagueDecides(id, decision);
    if (!expected.ok) {
      expect(result).toMatchObject({ ok: false, status: expected.status, code: expected.code });
      return;
    }
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toMatchObject({
      state: expected.state,
      ...(expected.currentVersion !== undefined && { currentVersion: expected.currentVersion }),
      ...(expected.declined !== undefined && { declinedThroughVersion: expected.declined }),
    });
  });
});

describe('FakeBackendStore publish timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const summaryStatus = (store: FakeBackendStore, version: number) => {
    const result = store.getChanges('T-TAX', version - 1);
    return result.ok ? result.value[0]?.status : undefined;
  };

  it('is preparing after publish and ready once the delay elapses', () => {
    const store = setup(3000);
    store.publish('T-TAX');
    expect(summaryStatus(store, 3)).toBe('preparing');
    vi.advanceTimersByTime(2999);
    expect(summaryStatus(store, 3)).toBe('preparing');
    vi.advanceTimersByTime(1);
    expect(summaryStatus(store, 3)).toBe('ready');
  });

  it('reset cancels a pending timer so it cannot flip a re-published version', () => {
    const store = setup(3000);
    store.publish('T-TAX');
    vi.advanceTimersByTime(2000);
    store.reset();
    store.publish('T-TAX');
    vi.advanceTimersByTime(1500);
    expect(summaryStatus(store, 3)).toBe('preparing');
    vi.advanceTimersByTime(1500);
    expect(summaryStatus(store, 3)).toBe('ready');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending timers when destroyed', () => {
    const store = setup(3000);
    store.publish('T-TAX');
    expect(vi.getTimerCount()).toBe(1);
    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('markReady fails without throwing for a missing or already-ready version', () => {
    const store = setup();
    expect(store.markReady('T-TAX', 9)).toMatchObject({
      ok: false,
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(store.markReady('T-TAX', 2)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(store.markReady('T-NOPE', 2)).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
