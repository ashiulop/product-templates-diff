import { describe, expect, it } from 'vitest';
import {
  ApiErrorSchema,
  DemoColleagueRequestSchema,
  DemoPublishRequestSchema,
  DemoPublishResponseSchema,
  EngagementStatusSchema,
  UpdateDecisionSchema,
  VersionSummarySchema,
} from './index';

const diffA = { id: 'd1', op: 'add', path: '/a', after: 1 };
const diffB = { id: 'd2', op: 'remove', path: '/b', before: 2 };
const item = {
  id: 'i1',
  title: 'Title',
  explanation: 'Why',
  category: 'added',
  diffRefs: ['d1'],
};
const ready = {
  templateId: 't1',
  version: 2,
  status: 'ready',
  source: 'llm',
  items: [item],
  diff: [diffA, diffB],
};
const preparing = { templateId: 't1', version: 2, status: 'preparing' };

const identity = {
  engagementId: 'e1',
  engagementName: 'Acme',
  templateId: 't1',
  templateName: 'Template',
};
const tracked = {
  ...identity,
  currentVersion: 1,
  declinedThroughVersion: null,
  latestVersion: 3,
  revision: 1,
};
const notYetChecked = { ...identity, state: 'not-yet-checked' };
const upToDate = { ...tracked, currentVersion: 3, state: 'up-to-date' };
const declined = { ...tracked, declinedThroughVersion: 3, state: 'declined' };
const pending = { ...tracked, state: 'update-pending', pendingCount: 2 };

describe('VersionSummarySchema', () => {
  it.each([
    ['preparing', preparing],
    ['ready', ready],
  ])('accepts a valid %s summary', (_name, value) => {
    expect(VersionSummarySchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['without source', { ...ready, source: undefined }],
    ['with duplicate diff ids', { ...ready, diff: [diffA, { ...diffB, id: 'd1' }] }],
    ['with an empty diffRefs', { ...ready, items: [{ ...item, diffRefs: [] }] }],
    ['with version 0', { ...ready, version: 0 }],
    ['with a non-integer version', { ...ready, version: 1.5 }],
    ['with an unknown status', { ...ready, status: 'draft' }],
  ])('rejects a ready summary %s', (_name, value) => {
    expect(VersionSummarySchema.safeParse(value).success).toBe(false);
  });

  it('rejects a diffRef missing from diff and names the ref', () => {
    const result = VersionSummarySchema.safeParse({
      ...ready,
      items: [{ ...item, diffRefs: ['d1', 'ghost'] }],
    });
    expect(result.success).toBe(false);
    const issue = result.error?.issues[0];
    expect(issue?.message).toContain('ghost');
    expect(issue?.path).toEqual(['items', 0, 'diffRefs', 1]);
  });
});

describe('EngagementStatusSchema', () => {
  it.each([
    ['not-yet-checked', notYetChecked],
    ['up-to-date', upToDate],
    ['declined', declined],
    ['update-pending', pending],
  ])('accepts a valid %s status', (_name, value) => {
    expect(EngagementStatusSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    ['update-pending with a wrong pendingCount', { ...pending, pendingCount: 1 }],
    ['up-to-date with current != latest', { ...upToDate, currentVersion: 2 }],
    ['current greater than latest', { ...declined, currentVersion: 4 }],
    ['an unknown state', { ...upToDate, state: 'archived' }],
    ['update-pending with pendingCount 0', { ...pending, currentVersion: 3, pendingCount: 0 }],
  ])('rejects %s', (_name, value) => {
    expect(EngagementStatusSchema.safeParse(value).success).toBe(false);
  });
});

describe('simple contracts', () => {
  it.each([
    [
      'UpdateDecision',
      UpdateDecisionSchema,
      { decision: 'apply', throughVersion: 2, expectedRevision: 1 },
    ],
    ['ApiError', ApiErrorSchema, { code: 'CONFLICT', message: 'stale' }],
    ['DemoPublishRequest', DemoPublishRequestSchema, { templateId: 't1' }],
    ['DemoPublishResponse', DemoPublishResponseSchema, { templateId: 't1', version: 2 }],
    [
      'DemoColleagueRequest',
      DemoColleagueRequestSchema,
      { engagementId: 'e1', decision: 'decline' },
    ],
  ])('%s accepts a valid value', (_name, schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each([
    [
      'UpdateDecision with an unknown decision',
      UpdateDecisionSchema,
      { decision: 'apply', throughVersion: 2, expectedRevision: 1 },
      { decision: 'skip' },
    ],
    [
      'UpdateDecision with throughVersion 0',
      UpdateDecisionSchema,
      { decision: 'apply', throughVersion: 2, expectedRevision: 1 },
      { throughVersion: 0 },
    ],
    [
      'ApiError with an unknown code',
      ApiErrorSchema,
      { code: 'CONFLICT', message: 'stale' },
      { code: 'OOPS' },
    ],
  ])('rejects %s', (_name, schema, valid, change) => {
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, ...change }).success).toBe(false);
  });
});
