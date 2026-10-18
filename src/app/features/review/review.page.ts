import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ChangeItem, DiffEntry, UpdateDecision, VersionSummary } from '../../contracts';
import { DecisionResult, EngagementApi } from '../../data/engagement-api';
import { toReviewViewModel, TrackedEngagementStatus } from './review-view-model';

export interface DecisionOutcome {
  role: 'status' | 'alert';
  text: string;
  offerReload: boolean;
  reloadNow: boolean;
}

export function decisionOutcome(
  result: DecisionResult,
  decision: UpdateDecision['decision'],
  throughVersion: number,
): DecisionOutcome {
  switch (result.kind) {
    case 'ok':
      return {
        role: 'status',
        text: `${decision === 'apply' ? 'Applied' : 'Declined'} through v${throughVersion}`,
        offerReload: false,
        reloadNow: true,
      };
    case 'conflict':
      return {
        role: 'alert',
        text: 'Someone else decided on this engagement. Reload to see the latest.',
        offerReload: true,
        reloadNow: false,
      };
    case 'rejected':
      return {
        role: 'alert',
        text: 'This decision is no longer valid. Reload to see the latest.',
        offerReload: true,
        reloadNow: false,
      };
    case 'not-found':
      return {
        role: 'alert',
        text: 'This engagement no longer exists.',
        offerReload: false,
        reloadNow: false,
      };
    case 'contract':
    case 'network':
      return {
        role: 'alert',
        text: 'Something went wrong. Try again.',
        offerReload: false,
        reloadNow: false,
      };
  }
}

export function rangeLabel(currentVersion: number, decideThrough: number | null): string {
  if (decideThrough === null) {
    return '';
  }
  const first = currentVersion + 1;
  return first === decideThrough ? ` v${first}` : ` v${first}\u2013v${decideThrough}`;
}

function formatValue(value: unknown): string {
  return value === undefined ? '—' : JSON.stringify(value);
}

function entriesFor(diff: DiffEntry[], item: ChangeItem): DiffEntry[] {
  return diff.filter((entry) => item.diffRefs.includes(entry.id));
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  selector: 'app-review-page',
  styleUrl: './review.page.css',
  templateUrl: './review.page.html',
})
export class ReviewPage {
  private readonly api = inject(EngagementApi);

  readonly engagementId = input.required<string>();

  protected readonly status = this.api.engagement(this.engagementId);

  protected readonly tracked = computed<TrackedEngagementStatus | null>(() => {
    if (!this.status.hasValue()) {
      return null;
    }
    const value = this.status.value();
    return value.state === 'not-yet-checked' ? null : value;
  });

  private readonly templateId = computed(() => this.tracked()?.templateId);
  private readonly after = computed(() => this.tracked()?.currentVersion);

  protected readonly changes = this.api.changes(this.templateId, this.after);

  protected readonly vm = computed(() => {
    const tracked = this.tracked();
    return tracked && this.changes.hasValue()
      ? toReviewViewModel(tracked, this.changes.value())
      : null;
  });

  protected readonly identity = computed(() =>
    this.status.hasValue() ? this.status.value() : null,
  );

  protected readonly submitting = signal(false);
  protected readonly outcome = signal<DecisionOutcome | null>(null);

  protected readonly busy = computed(
    () => this.submitting() || this.status.isLoading() || this.changes.isLoading(),
  );

  protected readonly rangeLabel = computed(() => {
    const tracked = this.tracked();
    return tracked ? rangeLabel(tracked.currentVersion, this.vm()?.decideThrough ?? null) : '';
  });

  protected readonly formatValue = formatValue;
  protected readonly entriesFor = entriesFor;

  protected sourceLabel(summary: VersionSummary): string {
    if (summary.status !== 'ready') {
      return '';
    }
    return summary.source === 'llm'
      ? 'AI-generated summary: check the linked changes'
      : 'Automatic summary';
  }

  protected reloadAll(): void {
    this.status.reload();
    this.changes.reload();
  }

  protected reloadAndClear(): void {
    this.outcome.set(null);
    this.reloadAll();
  }

  protected async decide(decision: UpdateDecision['decision']): Promise<void> {
    const vm = this.vm();
    const tracked = this.tracked();
    if (this.submitting() || !vm || !tracked || vm.decideThrough === null) {
      return;
    }
    const throughVersion = vm.decideThrough;
    this.submitting.set(true);
    this.outcome.set(null);
    try {
      const result = await this.api.decide(this.engagementId(), {
        decision,
        throughVersion,
        expectedRevision: tracked.revision,
      });
      const outcome = decisionOutcome(result, decision, throughVersion);
      this.outcome.set(outcome);
      if (outcome.reloadNow) {
        this.reloadAll();
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
