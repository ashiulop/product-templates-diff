import { DestroyRef, Injectable, inject } from '@angular/core';
import type { DemoPublishResponse, EngagementStatus, Identity, UpdateDecision, VersionSummary } from '../contracts';
import {
  type CatalogView,
  type Result,
  type Row,
  applyDecision,
  computeState,
  validateDecision,
} from './domain/rules';
import { FAKE_SUMMARY_READY_DELAY_MS } from './provide-fake-backend';
import { type SeedTemplate, createPublishedSummary, createSeed } from './seed';

function fail(
  status: number,
  code: 'NOT_FOUND' | 'SUMMARY_NOT_READY',
  message: string,
): Result<never> {
  return { ok: false, status, code, message };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value: structuredClone(value) };
}

/** In-memory server state for the fake backend. Every returned value is a deep copy. */
@Injectable({ providedIn: 'root' })
export class FakeBackendStore {
  private readonly readyDelayMs = inject(FAKE_SUMMARY_READY_DELAY_MS);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  private templates = new Map<string, SeedTemplate>();
  private engagements = new Map<string, Identity>();
  private rows = new Map<string, Row>();

  constructor() {
    this.load();
    inject(DestroyRef).onDestroy(() => this.clearTimers());
  }

  listEngagements(): Result<EngagementStatus[]> {
    const statuses: EngagementStatus[] = [];
    for (const identity of this.engagements.values()) {
      statuses.push(this.buildStatus(identity));
    }
    return ok(statuses);
  }

  getEngagement(engagementId: string): Result<EngagementStatus> {
    const identity = this.engagements.get(engagementId);
    if (!identity) {
      return this.engagementNotFound();
    }
    return ok(this.buildStatus(identity));
  }

  /** Summaries for versions `after + 1` to latest, ascending. */
  getChanges(templateId: string, after: number): Result<VersionSummary[]> {
    const template = this.templates.get(templateId);
    if (!template) {
      return this.templateNotFound();
    }
    const summaries: VersionSummary[] = [];
    for (let version = after + 1; version <= template.latestVersion; version++) {
      const summary = template.summaries.get(version);
      if (summary) {
        summaries.push(summary);
      }
    }
    return ok(summaries);
  }

  decide(engagementId: string, decision: UpdateDecision): Result<EngagementStatus> {
    const identity = this.engagements.get(engagementId);
    if (!identity) {
      return this.engagementNotFound();
    }
    return this.commit(identity, decision);
  }

  /** Bumps the template's latest version with a `preparing` summary that turns ready later. */
  publish(templateId: string): Result<DemoPublishResponse> {
    const template = this.templates.get(templateId);
    if (!template) {
      return this.templateNotFound();
    }
    const version = template.latestVersion + 1;
    template.latestVersion = version;
    template.summaries.set(version, { templateId, version, status: 'preparing' });

    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.markReady(templateId, version);
    }, this.readyDelayMs);
    this.timers.add(timer);

    return ok({ templateId, version });
  }

  /** Decides on behalf of a colleague, through the last ready version of the unbroken run. */
  colleagueDecides(
    engagementId: string,
    decision: UpdateDecision['decision'],
  ): Result<EngagementStatus> {
    const identity = this.engagements.get(engagementId);
    if (!identity) {
      return this.engagementNotFound();
    }
    const row = this.rows.get(engagementId);
    const template = this.templates.get(identity.templateId);
    if (!row || !template) {
      return this.engagementNotFound();
    }
    let throughVersion = row.currentVersion;
    while (this.isReady(template, throughVersion + 1)) {
      throughVersion++;
    }
    if (throughVersion === row.currentVersion) {
      return fail(422, 'SUMMARY_NOT_READY', 'No ready summary is available to decide on.');
    }
    return this.commit(identity, {
      decision,
      throughVersion,
      expectedRevision: row.revision,
    });
  }

  /** Flips a `preparing` summary to `ready`. Fails if the version is missing or not preparing. */
  markReady(templateId: string, version: number): Result<VersionSummary> {
    const template = this.templates.get(templateId);
    const summary = template?.summaries.get(version);
    if (!template || summary?.status !== 'preparing') {
      return fail(404, 'NOT_FOUND', `No preparing summary for ${templateId} v${version}.`);
    }
    const published = createPublishedSummary(templateId, version);
    template.summaries.set(version, published);
    return ok(published);
  }

  reset(): void {
    this.clearTimers();
    this.load();
  }

  private load(): void {
    const seed = createSeed();
    this.templates = seed.templates;
    this.engagements = new Map(seed.engagements.map((e) => [e.engagementId, e]));
    this.rows = new Map(seed.rows.map((row) => [row.engagementId, row]));
  }

  private clearTimers(): void {
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private isReady(template: SeedTemplate, version: number): boolean {
    return template.summaries.get(version)?.status === 'ready';
  }

  private commit(identity: Identity, decision: UpdateDecision): Result<EngagementStatus> {
    const template = this.templates.get(identity.templateId);
    if (!template) {
      return this.templateNotFound();
    }
    const catalog: CatalogView = {
      latestVersion: template.latestVersion,
      isReady: (version) => this.isReady(template, version),
    };
    const validated = validateDecision(this.rows.get(identity.engagementId), decision, catalog);
    if (!validated.ok) {
      return validated;
    }
    this.rows.set(identity.engagementId, applyDecision(validated.value, decision));
    return ok(this.buildStatus(identity));
  }

  private buildStatus(identity: Identity): EngagementStatus {
    const row = this.rows.get(identity.engagementId);
    const latestVersion = this.templates.get(identity.templateId)?.latestVersion;
    if (latestVersion === undefined) {
      throw new Error(`Invariant violation: unknown template ${identity.templateId}`);
    }
    const computed = computeState(row, latestVersion);
    if (!row) {
      return { ...identity, state: 'not-yet-checked' };
    }
    const tracked = {
      ...identity,
      currentVersion: row.currentVersion,
      declinedThroughVersion: row.declinedThroughVersion,
      latestVersion,
      revision: row.revision,
    };
    if (computed.state === 'update-pending') {
      return { ...tracked, state: 'update-pending', pendingCount: computed.pendingCount };
    }
    if (computed.state === 'not-yet-checked') {
      return { ...identity, state: 'not-yet-checked' };
    }
    return { ...tracked, state: computed.state };
  }

  private engagementNotFound(): Result<never> {
    return fail(404, 'NOT_FOUND', 'Engagement not found.');
  }

  private templateNotFound(): Result<never> {
    return fail(404, 'NOT_FOUND', 'Template not found.');
  }
}
