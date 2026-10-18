import { describe, expect, it } from 'vitest';
import type { VersionSummary } from '../../contracts';
import { toReviewViewModel, type TrackedEngagementStatus } from './review-view-model';

function tracked(currentVersion: number, declinedThroughVersion: number | null = null) {
  const status: TrackedEngagementStatus = {
    state: 'declined',
    engagementId: 'e1',
    engagementName: 'Acme',
    templateId: 't1',
    templateName: 'Template',
    currentVersion,
    declinedThroughVersion,
    latestVersion: 10,
    revision: 1,
  };
  return status;
}

function ready(version: number): VersionSummary {
  return {
    templateId: 't1',
    version,
    status: 'ready',
    source: 'rule-based',
    items: [],
    diff: [],
  };
}

function preparing(version: number): VersionSummary {
  return { templateId: 't1', version, status: 'preparing' };
}

/** Compact fixture: 'r4' is ready v4, 'p5' is preparing v5. */
function summaries(...specs: string[]): VersionSummary[] {
  return specs.map((spec) => {
    const version = Number(spec.slice(1));
    return spec.startsWith('r') ? ready(version) : preparing(version);
  });
}

describe('toReviewViewModel versions', () => {
  it.each([
    {
      name: 'drops versions at or below current',
      current: 3,
      specs: ['r2', 'r3', 'r4', 'r5'],
      expected: [4, 5],
    },
    {
      name: 'sorts ascending defensively',
      current: 3,
      specs: ['r6', 'r4', 'r5'],
      expected: [4, 5, 6],
    },
    { name: 'empty input', current: 3, specs: [], expected: [] },
    { name: 'nothing newer than current', current: 5, specs: ['r4', 'r5'], expected: [] },
  ])('$name', ({ current, specs, expected }) => {
    const vm = toReviewViewModel(tracked(current), summaries(...specs));
    expect(vm.versions.map((v) => v.version)).toEqual(expected);
  });

  it('carries the summary through', () => {
    const input = summaries('p4');
    const vm = toReviewViewModel(tracked(3), input);
    expect(vm.versions[0].summary).toEqual(input[0]);
  });

  it('does not mutate the input array', () => {
    const input = summaries('r6', 'r4', 'r5');
    const snapshot = [...input];
    toReviewViewModel(tracked(3), input);
    expect(input).toEqual(snapshot);
  });
});

describe('toReviewViewModel isNewSinceLastReview', () => {
  it.each([
    { declined: null, expected: [false, false, false, false] },
    { declined: 5, expected: [false, false, true, true] },
    { declined: 4, expected: [false, true, true, true] },
  ])('declined through $declined', ({ declined, expected }) => {
    const vm = toReviewViewModel(tracked(3, declined), summaries('r4', 'r5', 'r6', 'r7'));
    expect(vm.versions.map((v) => v.isNewSinceLastReview)).toEqual(expected);
  });
});

describe('toReviewViewModel decideThrough', () => {
  it.each([
    { name: 'all ready -> last', specs: ['r4', 'r5', 'r6'], expected: 6 },
    { name: 'ready then preparing -> the ready one', specs: ['r4', 'p5'], expected: 4 },
    {
      name: 'ready, preparing, ready -> stops at the first preparing',
      specs: ['r4', 'p5', 'r6'],
      expected: 4,
    },
    { name: 'first preparing -> null', specs: ['p4', 'r5'], expected: null },
    { name: 'no versions -> null', specs: [], expected: null },
    { name: 'gap breaks the run', specs: ['r4', 'r6'], expected: 4 },
    { name: 'first version missing -> null', specs: ['r5'], expected: null },
  ])('$name', ({ specs, expected }) => {
    expect(toReviewViewModel(tracked(3), summaries(...specs)).decideThrough).toBe(expected);
  });
});

describe('toReviewViewModel waitingFor', () => {
  it.each([
    { name: 'none preparing -> null', specs: ['r4', 'r5'], expected: null },
    { name: 'ready then preparing -> the preparing one', specs: ['r4', 'p5'], expected: 5 },
    { name: 'first of several preparing', specs: ['r4', 'p6', 'p5'], expected: 5 },
    { name: 'no versions -> null', specs: [], expected: null },
  ])('$name', ({ specs, expected }) => {
    expect(toReviewViewModel(tracked(3), summaries(...specs)).waitingFor).toBe(expected);
  });
});

describe('toReviewViewModel apply and decline', () => {
  it('leaves waitingFor null when the first version is missing', () => {
    expect(toReviewViewModel(tracked(3), summaries('r5')).waitingFor).toBeNull();
  });

  const allowed = { allowed: true };
  const blocked = (reason: string) => ({ allowed: false, reason });

  it.each([
    {
      name: 'all ready',
      declined: null,
      specs: ['r4', 'r5'],
      apply: allowed,
      decline: allowed,
    },
    {
      name: 'no versions',
      declined: null,
      specs: [],
      apply: blocked('No pending updates'),
      decline: blocked('No pending updates'),
    },
    {
      name: 'first version preparing',
      declined: null,
      specs: ['p4', 'r5'],
      apply: blocked('Waiting for the summary of v4'),
      decline: blocked('Waiting for the summary of v4'),
    },
    {
      name: 'first version missing (gap): names the missing version',
      declined: null,
      specs: ['r5'],
      apply: blocked('Waiting for the summary of v4'),
      decline: blocked('Waiting for the summary of v4'),
    },
    {
      name: 'ready then preparing is still decidable',
      declined: null,
      specs: ['r4', 'p5'],
      apply: allowed,
      decline: allowed,
    },
    {
      name: 'declined through the full range: apply allowed, decline blocked',
      declined: 6,
      specs: ['r4', 'r5', 'r6'],
      apply: allowed,
      decline: blocked('Already declined through v6'),
    },
    {
      name: 'declined through 5, a newer ready v6: decline allowed',
      declined: 5,
      specs: ['r4', 'r5', 'r6'],
      apply: allowed,
      decline: allowed,
    },
    {
      name: 'declined through 6 but only v4 decidable: decline blocked',
      declined: 6,
      specs: ['r4', 'p5', 'r6'],
      apply: allowed,
      decline: blocked('Already declined through v6'),
    },
    {
      name: 'declined, but waiting on first version',
      declined: 6,
      specs: ['p4', 'r5', 'r6'],
      apply: blocked('Waiting for the summary of v4'),
      decline: blocked('Waiting for the summary of v4'),
    },
  ])('$name', ({ declined, specs, apply, decline }) => {
    const vm = toReviewViewModel(tracked(3, declined), summaries(...specs));
    expect(vm.apply).toEqual(apply);
    expect(vm.decline).toEqual(decline);
  });
});
