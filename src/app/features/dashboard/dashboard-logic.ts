import type { EngagementStatus } from '../../contracts';

const GROUP_ORDER: Record<EngagementStatus['state'], number> = {
  'update-pending': 0,
  'not-yet-checked': 1,
  declined: 2,
  'up-to-date': 3,
};

export function sortForDashboard(statuses: readonly EngagementStatus[]): EngagementStatus[] {
  return [...statuses].sort(
    (a, b) =>
      GROUP_ORDER[a.state] - GROUP_ORDER[b.state] ||
      a.engagementName.localeCompare(b.engagementName),
  );
}

export function stateLabel(status: EngagementStatus): string {
  switch (status.state) {
    case 'up-to-date':
      return `Up to date (v${status.latestVersion})`;
    case 'update-pending': {
      const noun = status.pendingCount === 1 ? 'update' : 'updates';
      return `${status.pendingCount} ${noun} (v${status.currentVersion} → v${status.latestVersion})`;
    }
    case 'declined':
      return `Declined, on v${status.currentVersion} (latest v${status.latestVersion})`;
    case 'not-yet-checked':
      return 'Not yet checked';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function pendingSummary(statuses: readonly EngagementStatus[]): string {
  const pending = statuses.filter((s) => s.state === 'update-pending').length;
  return `${pending} of ${statuses.length} engagements have pending updates`;
}
