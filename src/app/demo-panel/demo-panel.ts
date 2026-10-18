import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod';
import {
  ApiErrorSchema,
  DemoColleagueRequest,
  DemoPublishRequest,
  DemoPublishResponseSchema,
  EngagementStatusSchema,
} from '../contracts';
import { EngagementApi } from '../data/engagement-api';
import { stateLabel } from '../features/dashboard/dashboard-logic';

const UNEXPECTED = 'Unexpected response from the server';
const NETWORK = 'Network error: could not reach the server';

// Deliberate local copy: engagement-api.ts keeps its helper private.
function logContract(issues: z.core.$ZodIssue[]): void {
  console.error('[contract]', issues);
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-demo-panel',
  styleUrl: './demo-panel.css',
  templateUrl: './demo-panel.html',
})
export class DemoPanel {
  private readonly http = inject(HttpClient);
  private readonly api = inject(EngagementApi);

  protected readonly options = this.api.engagements();
  protected readonly busy = signal(false);
  protected readonly outcome = signal('');

  protected readonly templates = computed(() => {
    if (!this.options.hasValue()) {
      return [];
    }
    const seen = new Map<string, string>();
    for (const row of this.options.value()) {
      if (!seen.has(row.templateId)) {
        seen.set(row.templateId, row.templateName);
      }
    }
    return [...seen].map(([id, name]) => ({ id, name }));
  });

  protected readonly engagements = computed(() =>
    this.options.hasValue() ? this.options.value() : [],
  );

  protected async publish(templateId: string): Promise<void> {
    const request: DemoPublishRequest = { templateId };
    await this.run(async () => {
      const body = await firstValueFrom(this.http.post<unknown>('/api/_demo/publish', request));
      const parsed = DemoPublishResponseSchema.safeParse(body);
      if (!parsed.success) {
        logContract(parsed.error.issues);
        return UNEXPECTED;
      }
      const name =
        this.templates().find((t) => t.id === parsed.data.templateId)?.name ??
        parsed.data.templateId;
      return `Published ${name} v${parsed.data.version} (summary being prepared). Other views do not refresh by themselves; reload the view to see it.`;
    }, 'Publish failed');
  }

  protected async colleagueDecides(
    engagementId: string,
    decision: DemoColleagueRequest['decision'],
  ): Promise<void> {
    const request: DemoColleagueRequest = { engagementId, decision };
    await this.run(async () => {
      const body = await firstValueFrom(
        this.http.post<unknown>('/api/_demo/colleague-decides', request),
      );
      const parsed = EngagementStatusSchema.safeParse(body);
      if (!parsed.success) {
        logContract(parsed.error.issues);
        return UNEXPECTED;
      }
      const verb = decision === 'apply' ? 'applied' : 'declined';
      return `Colleague ${verb} ${parsed.data.engagementName}, now: ${stateLabel(parsed.data)}. Other views are not refreshed.`;
    }, 'Colleague could not decide');
  }

  protected async reset(): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.http.post<unknown>('/api/_demo/reset', null));
      return 'Demo data reset. Other views do not refresh by themselves; reload the view to see it.';
    }, 'Reset failed');
  }

  private async run(action: () => Promise<string>, failure: string): Promise<void> {
    this.busy.set(true);
    try {
      this.outcome.set(await action());
    } catch (error) {
      this.outcome.set(this.describeError(error, failure));
    } finally {
      this.busy.set(false);
    }
  }

  private describeError(error: unknown, failure: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return UNEXPECTED;
    }
    if (error.status === 0) {
      return NETWORK;
    }
    const parsed = ApiErrorSchema.safeParse(error.error);
    if (!parsed.success) {
      logContract(parsed.error.issues);
      return UNEXPECTED;
    }
    return `${failure}: ${parsed.data.code}`;
  }
}
