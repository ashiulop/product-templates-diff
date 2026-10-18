import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EngagementApi } from '../../data/engagement-api';
import { pendingSummary, sortForDashboard, stateLabel } from './dashboard-logic';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  selector: 'app-dashboard-page',
  styleUrl: './dashboard.page.css',
  templateUrl: './dashboard.page.html',
})
export class DashboardPage {
  private readonly api = inject(EngagementApi);

  protected readonly engagements = this.api.engagements();

  protected readonly rows = computed(() =>
    this.engagements.hasValue() ? sortForDashboard(this.engagements.value()) : [],
  );

  protected readonly summary = computed(() =>
    this.engagements.hasValue() ? pendingSummary(this.engagements.value()) : '',
  );

  protected readonly stateLabel = stateLabel;
}
