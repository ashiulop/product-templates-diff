import { describe, expect, it } from 'vitest';
import type { EngagementStatus } from '../../contracts';
import { pendingSummary, sortForDashboard, stateLabel } from './dashboard-logic';

type Tracked = Exclude<EngagementStatus, { state: 'not-yet-checked' }>;

const base = { templateId: 't1', templateName: 'Template', revision: 1 };

function notChecked(name: string): EngagementStatus {
  return {
    state: 'not-yet-checked',
    engagementId: name,
    engagementName: name,
    templateId: 't1',
    templateName: 'Template',
  };
}

function upToDate(name: string, version = 6): EngagementStatus {
  return {
    ...base,
    state: 'up-to-date',
    engagementId: name,
    engagementName: name,
    currentVersion: version,
    declinedThroughVersion: null,
    latestVersion: version,
  };
}

function declined(name: string, current = 3, latest = 6): EngagementStatus {
  return {
    ...base,
    state: 'declined',
    engagementId: name,
    engagementName: name,
    currentVersion: current,
    declinedThroughVersion: latest,
    latestVersion: latest,
  };
}

function pending(name: string, current = 5, latest = 6): EngagementStatus {
  const status: Tracked = {
    ...base,
    state: 'update-pending',
    engagementId: name,
    engagementName: name,
    currentVersion: current,
    declinedThroughVersion: null,
    latestVersion: latest,
    pendingCount: latest - current,
  };
  return status;
}

describe('sortForDashboard', () => {
  it('orders groups pending, not-yet-checked, declined, up-to-date', () => {
    const sorted = sortForDashboard([upToDate('A'), declined('B'), notChecked('C'), pending('D')]);
    expect(sorted.map((s) => s.state)).toEqual([
      'update-pending',
      'not-yet-checked',
      'declined',
      'up-to-date',
    ]);
  });

  it.each([
    { name: 'pending', make: pending },
    { name: 'not-yet-checked', make: notChecked },
    { name: 'declined', make: declined },
    { name: 'up-to-date', make: upToDate },
  ])('sorts $name by engagementName within the group', ({ make }) => {
    const sorted = sortForDashboard([make('Zeta'), make('alpha'), make('Mid')]);
    expect(sorted.map((s) => s.engagementName)).toEqual(['alpha', 'Mid', 'Zeta']);
  });

  it('combines group order and name order', () => {
    const sorted = sortForDashboard([upToDate('A'), pending('Z'), pending('B'), notChecked('M')]);
    expect(sorted.map((s) => s.engagementName)).toEqual(['B', 'Z', 'M', 'A']);
  });

  it('returns a new array and does not mutate the input', () => {
    const input = [upToDate('B'), pending('A')];
    const snapshot = [...input];
    const sorted = sortForDashboard(input);
    expect(sorted).not.toBe(input);
    expect(input).toEqual(snapshot);
  });

  it('handles an empty list', () => {
    expect(sortForDashboard([])).toEqual([]);
  });
});

describe('stateLabel', () => {
  it.each([
    { name: 'up to date', status: upToDate('A', 6), expected: 'Up to date (v6)' },
    { name: 'singular update', status: pending('A', 5, 6), expected: '1 update (v5 → v6)' },
    { name: 'plural updates', status: pending('A', 3, 6), expected: '3 updates (v3 → v6)' },
    { name: 'declined', status: declined('A', 3, 6), expected: 'Declined, on v3 (latest v6)' },
    { name: 'not yet checked', status: notChecked('A'), expected: 'Not yet checked' },
  ])('$name', ({ status, expected }) => {
    expect(stateLabel(status)).toBe(expected);
  });
});

describe('pendingSummary', () => {
  it.each([
    {
      name: 'mixed list',
      statuses: [pending('A'), pending('B'), upToDate('C'), declined('D'), notChecked('E')],
      expected: '2 of 5 engagements have pending updates',
    },
    {
      name: 'none pending',
      statuses: [upToDate('A'), notChecked('B')],
      expected: '0 of 2 engagements have pending updates',
    },
    {
      name: 'all pending',
      statuses: [pending('A'), pending('B')],
      expected: '2 of 2 engagements have pending updates',
    },
    {
      name: 'one of one',
      statuses: [pending('A')],
      expected: '1 of 1 engagements have pending updates',
    },
    { name: 'empty', statuses: [], expected: '0 of 0 engagements have pending updates' },
  ])('$name', ({ statuses, expected }) => {
    expect(pendingSummary(statuses)).toBe(expected);
  });
});
