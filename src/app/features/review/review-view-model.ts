import type { EngagementStatus, VersionSummary } from '../../contracts';

export type TrackedEngagementStatus = Exclude<EngagementStatus, { state: 'not-yet-checked' }>;

type Gate = { allowed: true } | { allowed: false; reason: string };

export interface ReviewVm {
  versions: { version: number; isNewSinceLastReview: boolean; summary: VersionSummary }[];
  decideThrough: number | null;
  waitingFor: number | null;
  apply: Gate;
  decline: Gate;
}

export function toReviewViewModel(
  status: TrackedEngagementStatus,
  summaries: VersionSummary[],
): ReviewVm {
  const { currentVersion, declinedThroughVersion } = status;

  const sorted = summaries
    .filter((s) => s.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  const versions = sorted.map((summary) => ({
    version: summary.version,
    isNewSinceLastReview:
      declinedThroughVersion !== null && summary.version > declinedThroughVersion,
    summary,
  }));

  // Unbroken run of ready summaries at currentVersion + 1, + 2, ...
  let decideThrough: number | null = null;
  let next = currentVersion + 1;
  for (const { version, summary } of versions) {
    if (version !== next || summary.status !== 'ready') {
      break;
    }
    decideThrough = version;
    next += 1;
  }

  const waitingFor = versions.find((v) => v.summary.status === 'preparing')?.version ?? null;

  const blockedReason =
    versions.length === 0
      ? 'No pending updates'
      : `Waiting for the summary of v${currentVersion + 1}`;

  const apply: Gate =
    decideThrough !== null ? { allowed: true } : { allowed: false, reason: blockedReason };

  let decline: Gate;
  if (decideThrough === null) {
    decline = { allowed: false, reason: blockedReason };
  } else if (decideThrough > (declinedThroughVersion ?? currentVersion)) {
    decline = { allowed: true };
  } else {
    decline = { allowed: false, reason: `Already declined through v${declinedThroughVersion}` };
  }

  return { versions, decideThrough, waitingFor, apply, decline };
}
