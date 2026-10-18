import { describe, expect, it } from 'vitest';
import { applyDecision, computeState, validateDecision, type CatalogView, type Row } from './rules';
import type { UpdateDecision } from '../../contracts';

const row = (over: Partial<Row> = {}): Row => ({
  engagementId: 'e1',
  templateId: 't1',
  currentVersion: 3,
  declinedThroughVersion: null,
  revision: 5,
  ...over,
});

const catalog = (latestVersion: number, notReady: number[] = []): CatalogView => ({
  latestVersion,
  isReady: (v) => !notReady.includes(v),
});

const decision = (over: Partial<UpdateDecision>): UpdateDecision => ({
  decision: 'apply',
  throughVersion: 4,
  expectedRevision: 5,
  ...over,
});

describe('computeState', () => {
  it.each([
    ['no row', undefined, 5, { state: 'not-yet-checked' }],
    ['current equals latest', row({ currentVersion: 5 }), 5, { state: 'up-to-date' }],
    [
      'current equals latest, with a decline recorded',
      row({ currentVersion: 5, declinedThroughVersion: 5 }),
      5,
      { state: 'up-to-date' },
    ],
    [
      'declined through latest',
      row({ currentVersion: 3, declinedThroughVersion: 5 }),
      5,
      { state: 'declined' },
    ],
    [
      'declined beyond latest',
      row({ currentVersion: 3, declinedThroughVersion: 6 }),
      5,
      { state: 'declined' },
    ],
    [
      'declined below latest',
      row({ currentVersion: 3, declinedThroughVersion: 4 }),
      5,
      { state: 'update-pending', pendingCount: 2 },
    ],
    [
      'never declined',
      row({ currentVersion: 3, declinedThroughVersion: null }),
      5,
      { state: 'update-pending', pendingCount: 2 },
    ],
    [
      'one version behind',
      row({ currentVersion: 4 }),
      5,
      { state: 'update-pending', pendingCount: 1 },
    ],
  ])('%s', (_name, r, latest, expected) => {
    expect(computeState(r, latest)).toEqual(expected);
  });

  it('throws an invariant error when current exceeds latest, naming both versions', () => {
    expect(() => computeState(row({ currentVersion: 7 }), 5)).toThrow(/7.*5|5.*7/);
  });
});

describe('validateDecision', () => {
  it.each([
    [
      'unknown engagement',
      undefined,
      decision({}),
      catalog(5),
      { status: 404, code: 'NOT_FOUND' },
    ],
    [
      'stale revision, range otherwise valid',
      row(),
      decision({ expectedRevision: 4 }),
      catalog(5),
      { status: 409, code: 'CONFLICT' },
    ],
    [
      'stale revision even when the range is also invalid',
      row(),
      decision({ expectedRevision: 4, throughVersion: 99 }),
      catalog(5),
      { status: 409, code: 'CONFLICT' },
    ],
    [
      'stale revision even when a version is not ready',
      row(),
      decision({ expectedRevision: 4 }),
      catalog(5, [4]),
      { status: 409, code: 'CONFLICT' },
    ],
    [
      'apply through = current',
      row(),
      decision({ throughVersion: 3 }),
      catalog(5),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'apply through below current',
      row(),
      decision({ throughVersion: 2 }),
      catalog(5),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'apply through latest + 1',
      row(),
      decision({ throughVersion: 6 }),
      catalog(5),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'apply with an unready version in range',
      row(),
      decision({ throughVersion: 5 }),
      catalog(5, [4]),
      { status: 422, code: 'SUMMARY_NOT_READY' },
    ],
    [
      'apply where the unready version is the through version',
      row(),
      decision({ throughVersion: 4 }),
      catalog(5, [4]),
      { status: 422, code: 'SUMMARY_NOT_READY' },
    ],
    [
      'decline through = declined-through',
      row({ declinedThroughVersion: 4 }),
      decision({ decision: 'decline', throughVersion: 4 }),
      catalog(5),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'decline below declined-through',
      row({ declinedThroughVersion: 5 }),
      decision({ decision: 'decline', throughVersion: 4 }),
      catalog(6),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'decline through = current',
      row(),
      decision({ decision: 'decline', throughVersion: 3 }),
      catalog(5),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'decline through latest + 1',
      row(),
      decision({ decision: 'decline', throughVersion: 6 }),
      catalog(5),
      { status: 422, code: 'INVALID_THROUGH_VERSION' },
    ],
    [
      'decline with an unready version in range',
      row(),
      decision({ decision: 'decline', throughVersion: 5 }),
      catalog(5, [5]),
      { status: 422, code: 'SUMMARY_NOT_READY' },
    ],
  ])('rejects: %s', (_name, r, d, c, expected) => {
    const result = validateDecision(r, d, c);
    expect(result).toMatchObject({ ok: false, ...expected });
    if (!result.ok) {
      expect(result.message).not.toBe('');
    }
  });

  it.each([
    ['a valid apply', row(), decision({ throughVersion: 5 }), catalog(5)],
    ['a valid apply to the next version', row(), decision({ throughVersion: 4 }), catalog(5)],
    [
      'a valid decline',
      row(),
      decision({ decision: 'decline', throughVersion: 4 }),
      catalog(5),
    ],
    [
      'a decline extending a previous decline',
      row({ declinedThroughVersion: 4 }),
      decision({ decision: 'decline', throughVersion: 5 }),
      catalog(5),
    ],
    [
      'apply after a decline (declined 6, apply through 6)',
      row({ currentVersion: 3, declinedThroughVersion: 6 }),
      decision({ throughVersion: 6 }),
      catalog(7),
    ],
    [
      'versions beyond the through version may be unready',
      row(),
      decision({ throughVersion: 4 }),
      catalog(5, [5]),
    ],
  ])('accepts: %s', (_name, r, d, c) => {
    const result = validateDecision(r, d, c);
    expect(result).toEqual({ ok: true, value: r });
    if (result.ok) {
      expect(result.value).toBe(r);
    }
  });
});

describe('applyDecision', () => {
  it.each([
    [
      'apply clears declined-through when it is below through',
      row({ declinedThroughVersion: 4 }),
      decision({ throughVersion: 5 }),
      { currentVersion: 5, declinedThroughVersion: null },
    ],
    [
      'apply clears declined-through when it equals through',
      row({ declinedThroughVersion: 5 }),
      decision({ throughVersion: 5 }),
      { currentVersion: 5, declinedThroughVersion: null },
    ],
    [
      'apply keeps declined-through when it is above through',
      row({ declinedThroughVersion: 6 }),
      decision({ throughVersion: 5 }),
      { currentVersion: 5, declinedThroughVersion: 6 },
    ],
    [
      'apply leaves a null declined-through null',
      row({ declinedThroughVersion: null }),
      decision({ throughVersion: 4 }),
      { currentVersion: 4, declinedThroughVersion: null },
    ],
    [
      'decline sets declined-through',
      row({ declinedThroughVersion: null }),
      decision({ decision: 'decline', throughVersion: 5 }),
      { currentVersion: 3, declinedThroughVersion: 5 },
    ],
    [
      'decline raises an earlier declined-through',
      row({ declinedThroughVersion: 4 }),
      decision({ decision: 'decline', throughVersion: 5 }),
      { currentVersion: 3, declinedThroughVersion: 5 },
    ],
  ])('%s', (_name, r, d, expected) => {
    expect(applyDecision(r, d)).toEqual({ ...r, ...expected, revision: r.revision + 1 });
  });

  it.each([
    ['apply', decision({ decision: 'apply', throughVersion: 4 })],
    ['decline', decision({ decision: 'decline', throughVersion: 4 })],
  ])('%s increments revision by exactly 1', (_name, d) => {
    expect(applyDecision(row({ revision: 9 }), d).revision).toBe(10);
  });

  it.each([
    ['apply', decision({ decision: 'apply', throughVersion: 5 })],
    ['decline', decision({ decision: 'decline', throughVersion: 5 })],
  ])('%s does not mutate its input and returns a new row', (_name, d) => {
    const input = row({ declinedThroughVersion: 4 });
    const snapshot = structuredClone(input);
    Object.freeze(input);
    const out = applyDecision(input, d);
    expect(input).toEqual(snapshot);
    expect(out).not.toBe(input);
  });
});
