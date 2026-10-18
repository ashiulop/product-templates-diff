import type { ApiError, EngagementStatus, Tracked, UpdateDecision } from '../../contracts';

type DistributivePick<T, K extends PropertyKey> = T extends unknown
  ? Pick<T, Extract<keyof T, K>>
  : never;

/** The stored status row. */
export type Row = Pick<
  Tracked,
  'engagementId' | 'templateId' | 'currentVersion' | 'declinedThroughVersion' | 'revision'
>;

/** The state part of an `EngagementStatus`. */
export type ComputedState = DistributivePick<EngagementStatus, 'state' | 'pendingCount'>;

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; code: ApiError['code']; message: string };

export interface CatalogView {
  latestVersion: number;
  isReady(version: number): boolean;
}

export function computeState(row: Row | undefined, latestVersion: number): ComputedState {
  if (!row) {
    return { state: 'not-yet-checked' };
  }
  if (row.currentVersion > latestVersion) {
    throw new Error(
      `Invariant violation: currentVersion ${row.currentVersion} exceeds latestVersion ${latestVersion}`,
    );
  }
  if (row.currentVersion === latestVersion) {
    return { state: 'up-to-date' };
  }
  if (row.declinedThroughVersion !== null && row.declinedThroughVersion >= latestVersion) {
    return { state: 'declined' };
  }
  return { state: 'update-pending', pendingCount: latestVersion - row.currentVersion };
}

function reject(status: number, code: ApiError['code'], message: string): Result<never> {
  return { ok: false, status, code, message };
}

export function validateDecision(
  row: Row | undefined,
  decision: UpdateDecision,
  catalog: CatalogView,
): Result<Row> {
  if (!row) {
    return reject(404, 'NOT_FOUND', 'Engagement not found.');
  }
  if (decision.expectedRevision !== row.revision) {
    return reject(409, 'CONFLICT', 'This engagement changed since you loaded it.');
  }

  const { throughVersion } = decision;
  const floor =
    decision.decision === 'apply'
      ? row.currentVersion
      : Math.max(row.currentVersion, row.declinedThroughVersion ?? row.currentVersion);
  if (throughVersion <= floor || throughVersion > catalog.latestVersion) {
    return reject(
      422,
      'INVALID_THROUGH_VERSION',
      `Version must be above ${floor} and at most ${catalog.latestVersion}.`,
    );
  }

  for (let version = row.currentVersion + 1; version <= throughVersion; version++) {
    if (!catalog.isReady(version)) {
      return reject(422, 'SUMMARY_NOT_READY', `The summary for version ${version} is not ready.`);
    }
  }

  return { ok: true, value: row };
}

export function applyDecision(row: Row, decision: UpdateDecision): Row {
  const { throughVersion } = decision;
  if (decision.decision === 'decline') {
    return { ...row, declinedThroughVersion: throughVersion, revision: row.revision + 1 };
  }
  const keepDeclined =
    row.declinedThroughVersion !== null && row.declinedThroughVersion > throughVersion;
  return {
    ...row,
    currentVersion: throughVersion,
    declinedThroughVersion: keepDeclined ? row.declinedThroughVersion : null,
    revision: row.revision + 1,
  };
}
