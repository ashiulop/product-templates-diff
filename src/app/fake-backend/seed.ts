import type { ChangeItem, DiffEntry, Identity, VersionSummary } from '../contracts';
import type { Row } from './domain/rules';

export interface SeedTemplate {
  name: string;
  latestVersion: number;
  summaries: Map<number, VersionSummary>;
}

export interface SeedData {
  templates: Map<string, SeedTemplate>;
  engagements: Identity[];
  rows: Row[];
}

type ReadySummary = Extract<VersionSummary, { status: 'ready' }>;

function ready(
  templateId: string,
  version: number,
  source: ReadySummary['source'],
  items: ChangeItem[],
  diff: DiffEntry[],
): VersionSummary {
  return { templateId, version, status: 'ready', source, items, diff };
}

function templateSummaries(summaries: VersionSummary[]): Map<number, VersionSummary> {
  return new Map(summaries.map((summary) => [summary.version, summary]));
}

/** The ready summary the demo "publish" produces once the delay elapses (B8). */
export function createPublishedSummary(templateId: string, version: number): VersionSummary {
  const d1 = `d${version}-1`;
  const d2 = `d${version}-2`;
  return ready(
    templateId,
    version,
    'llm',
    [
      {
        id: `i${version}-1`,
        title: 'Confirmation sample size increased',
        explanation:
          'External confirmations now cover a larger share of year-end receivables, so more balances must be confirmed.',
        category: 'changed-requirement',
        diffRefs: [d1],
      },
      {
        id: `i${version}-2`,
        title: 'Subsequent events inquiry added',
        explanation:
          'A new procedure requires written representations to management about events after the reporting date.',
        category: 'added',
        diffRefs: [d2],
      },
    ],
    [
      {
        id: d1,
        op: 'replace',
        path: '/procedures/receivables/confirmationCoverage',
        before: '40%',
        after: '60%',
      },
      {
        id: d2,
        op: 'add',
        path: '/procedures/completion/subsequentEventsInquiry',
        after: 'Obtain written representations from management on events after the reporting date.',
      },
    ],
  );
}

/** Fresh, deterministic seed data (B8). Every call returns new objects. */
export function createSeed(): SeedData {
  const audit = templateSummaries([
    ready(
      'T-AUDIT',
      2,
      'llm',
      [
        {
          id: 'i2-1',
          title: 'Journal entry testing sample raised',
          explanation:
            'The minimum number of manual journal entries selected for testing rises from 25 to 40.',
          category: 'changed-requirement',
          diffRefs: ['d2-1'],
        },
      ],
      [
        {
          id: 'd2-1',
          op: 'replace',
          path: '/procedures/journal-entries/minimumSampleSize',
          before: 25,
          after: 40,
        },
      ],
    ),
    ready(
      'T-AUDIT',
      3,
      'llm',
      [
        {
          id: 'i3-1',
          title: 'Going concern assessment documentation',
          explanation:
            "Auditors must document management's going concern assessment covering at least twelve months.",
          category: 'added',
          diffRefs: ['d3-1'],
        },
        {
          id: 'i3-2',
          title: 'Legacy inventory observation step removed',
          explanation:
            'The separate paper-based inventory count sheet review is dropped in favour of the electronic count procedure.',
          category: 'removed',
          diffRefs: ['d3-2'],
        },
      ],
      [
        {
          id: 'd3-1',
          op: 'add',
          path: '/procedures/going-concern/managementAssessment',
          after:
            'Document management assessment covering at least twelve months from the reporting date.',
        },
        {
          id: 'd3-2',
          op: 'remove',
          path: '/procedures/inventory/paperCountSheetReview',
          before: 'Review paper count sheets against the perpetual inventory records.',
        },
      ],
    ),
    ready(
      'T-AUDIT',
      4,
      'llm',
      [
        {
          id: 'i4-1',
          title: 'Wording clarified for related party disclosure',
          explanation:
            'The instruction now says "identify and evaluate" related party transactions instead of "review". No change in scope.',
          category: 'wording-only',
          diffRefs: ['d4-1'],
        },
        {
          id: 'i4-2',
          title: 'Revenue cut-off testing window widened',
          explanation:
            'Cut-off testing covers five days either side of the reporting date, up from three, with matching evidence retention.',
          category: 'changed-requirement',
          diffRefs: ['d4-2', 'd4-3'],
        },
      ],
      [
        {
          id: 'd4-1',
          op: 'replace',
          path: '/procedures/related-parties/instruction',
          before: 'Review related party transactions.',
          after: 'Identify and evaluate related party transactions.',
        },
        {
          id: 'd4-2',
          op: 'replace',
          path: '/procedures/revenue/cutOffDays',
          before: 3,
          after: 5,
        },
        {
          id: 'd4-3',
          op: 'replace',
          path: '/procedures/revenue/cutOffEvidenceRetention',
          before: 'Retain a listing of tested items.',
          after: 'Retain copies of shipping and invoice documents for every tested item.',
        },
      ],
    ),
    ready(
      'T-AUDIT',
      5,
      'rule-based',
      [
        {
          id: 'i5-1',
          title: 'Engagement quality review checkpoint added',
          explanation:
            'A new checkpoint requires a quality reviewer sign-off before the report is issued.',
          category: 'added',
          diffRefs: ['d5-1'],
        },
      ],
      [
        {
          id: 'd5-1',
          op: 'add',
          path: '/completion/engagementQualityReview',
          after: 'Quality reviewer sign-off required before report issuance.',
        },
      ],
    ),
    ready(
      'T-AUDIT',
      6,
      'llm',
      [
        {
          id: 'i6-1',
          title: 'Analytical review threshold tightened',
          explanation:
            'Variances above 5% (previously 10%) between expectation and recorded amount now require investigation.',
          category: 'changed-requirement',
          diffRefs: ['d6-1'],
        },
        {
          id: 'i6-2',
          title: 'Fixed asset physical verification removed',
          explanation:
            'The mandatory annual physical verification of low-value fixed assets is no longer required.',
          category: 'removed',
          diffRefs: ['d6-2'],
        },
        {
          id: 'i6-3',
          title: 'Section heading reworded',
          explanation:
            'The heading "Substantive tests" is now "Substantive procedures". Wording only.',
          category: 'wording-only',
          diffRefs: ['d6-3'],
        },
      ],
      [
        {
          id: 'd6-1',
          op: 'replace',
          path: '/procedures/analytics/investigationThresholdPercent',
          before: 10,
          after: 5,
        },
        {
          id: 'd6-2',
          op: 'remove',
          path: '/procedures/fixed-assets/lowValuePhysicalVerification',
          before: 'Physically verify low-value fixed assets annually.',
        },
        {
          id: 'd6-3',
          op: 'replace',
          path: '/sections/substantive/heading',
          before: 'Substantive tests',
          after: 'Substantive procedures',
        },
      ],
    ),
  ]);

  const icr = templateSummaries([
    ready(
      'T-ICR',
      2,
      'llm',
      [
        {
          id: 'i2-1',
          title: 'Control walkthrough evidence required',
          explanation:
            'Each key control walkthrough must now be supported by a retained screenshot or system report.',
          category: 'added',
          diffRefs: ['d2-1'],
        },
        {
          id: 'i2-2',
          title: 'Access review frequency changed',
          explanation: 'User access reviews move from annual to semi-annual for financial systems.',
          category: 'changed-requirement',
          diffRefs: ['d2-2'],
        },
      ],
      [
        {
          id: 'd2-1',
          op: 'add',
          path: '/controls/walkthrough/evidenceRetention',
          after: 'Retain a screenshot or system report for every key control walkthrough.',
        },
        {
          id: 'd2-2',
          op: 'replace',
          path: '/controls/access/reviewFrequency',
          before: 'annual',
          after: 'semi-annual',
        },
      ],
    ),
    { templateId: 'T-ICR', version: 3, status: 'preparing' },
  ]);

  const tax = templateSummaries([
    ready(
      'T-TAX',
      2,
      'rule-based',
      [
        {
          id: 'i2-1',
          title: 'Transfer pricing documentation threshold updated',
          explanation:
            'Documentation is required for intercompany transactions above EUR 250,000 instead of EUR 500,000.',
          category: 'changed-requirement',
          diffRefs: ['d2-1'],
        },
      ],
      [
        {
          id: 'd2-1',
          op: 'replace',
          path: '/procedures/transfer-pricing/documentationThresholdEur',
          before: 500000,
          after: 250000,
        },
      ],
    ),
  ]);

  const templates = new Map<string, SeedTemplate>([
    ['T-AUDIT', { name: 'Statutory Audit (EU)', latestVersion: 6, summaries: audit }],
    ['T-ICR', { name: 'Internal Controls Review', latestVersion: 3, summaries: icr }],
    ['T-TAX', { name: 'Tax Compliance Pack', latestVersion: 2, summaries: tax }],
  ]);

  const engagementTuples: [string, string, string][] = [
    ['E-001', 'Acme Manufacturing FY2026', 'T-AUDIT'],
    ['E-002', 'Brightline Retail FY2026', 'T-AUDIT'],
    ['E-003', 'Coastal Logistics FY2026', 'T-AUDIT'],
    ['E-004', 'Delta Health FY2026', 'T-AUDIT'],
    ['E-005', 'Evergreen Foods FY2026', 'T-ICR'],
    ['E-006', 'Fjord Shipping FY2026', 'T-ICR'],
    ['E-007', 'Granite Construction FY2026', 'T-TAX'],
    ['E-008', 'Harbor Insurance FY2026', 'T-TAX'],
  ];
  const engagements: Identity[] = engagementTuples.map(
    ([engagementId, engagementName, templateId]) => ({
      engagementId,
      engagementName,
      templateId,
      templateName: templates.get(templateId)?.name ?? templateId,
    }),
  );

  const rowTuples: [string, string, number, number | null, number][] = [
    ['E-001', 'T-AUDIT', 6, null, 1],
    ['E-002', 'T-AUDIT', 5, null, 1],
    ['E-003', 'T-AUDIT', 3, 5, 2],
    ['E-004', 'T-AUDIT', 3, 6, 2],
    ['E-005', 'T-ICR', 1, null, 1],
    ['E-007', 'T-TAX', 1, null, 1],
    ['E-008', 'T-TAX', 2, null, 1],
  ];
  const rows: Row[] = rowTuples.map(
    ([engagementId, templateId, currentVersion, declinedThroughVersion, revision]) => ({
      engagementId,
      templateId,
      currentVersion,
      declinedThroughVersion,
      revision,
    }),
  );

  return {
    templates,
    engagements,
    rows,
  };
}
