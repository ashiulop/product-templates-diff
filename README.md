# Pending template updates

## 1. What this is

An Angular 22 app (zoneless, strict TypeScript, Vitest, Zod 4, plain CSS) that implements one slice of a larger design: the firm-side review flow for template updates.

Context: an accounting firm works in engagement files, and each file is created from a versioned product template. Templates change about once a week. For each engagement the user either applies an update or declines it. The wider design stores a small status row per engagement (template, current version, declined-through version, revision) and a shared change catalog with one summary per template version, generated at publish time. "Pending" is computed when the data is read. Loading an engagement file takes about a minute, so nothing here ever loads one.

This slice covers three things:

1. See which engagements have pending updates (dashboard).
2. Read one summary per pending version (review page).
3. Apply or decline through a version, with correct handling of concurrency and partial data.

I chose it because that is where the hard correctness problems are: stale views, concurrent users, summaries that are not ready yet, and data you cannot trust. A fake backend plays the engagement system and the change catalog behind a real HTTP boundary, so the front end is written as it would be against a real API.

## 2. Run it

```bash
npm install
npm start          # http://localhost:4200
npx ng test        # watch mode
npx ng test --watch=false   # single run
npx ng lint
npx ng build
```

The fake backend is an HTTP interceptor with an in-memory store inside the browser tab. A browser reload resets all demo data. Default fake latency is 300 ms. A summary published from the demo panel flips from preparing to ready after 3 s.

### 2-minute demo

Do not reload the browser during this; it would reset the data. To see changes on the dashboard use its Refresh button, or go back and reopen the engagement.

1. **Flagged version.** On the dashboard, click Review on E-003 (Coastal Logistics FY2026). Versions v4, v5 and v6 are listed. v6 carries the badge "New since your last review", because the engagement declined through v5 earlier. Expand "Show changes" on an item to see the diff entries behind it.
2. **Decision stops at v2.** Go back and open E-005 (Evergreen Foods FY2026). The button reads "Apply v2", and the note says "Decisions stop at v2: the summary of v3 is still being prepared." The v3 summary is seeded as stuck in preparing.
3. **Conflict.** Open E-002 (Brightline Retail FY2026) and leave the page open. Open "Demo controls (simulates other actors)", pick Brightline Retail FY2026 in the Engagement select and click "Colleague applies" (or "Colleague declines"). The panel reports the outcome, but the review page does not refresh, which is the point. Click Apply on the page. The alert reads "Someone else decided on this engagement. Reload to see the latest." Click Reload to see the current state.
4. **Publish mid-review.** Open E-003 again. In the demo panel, choose Statutory Audit (EU) in the Template select and click "Publish new version" (this creates v7, in preparing; it flips to ready about 3 s later). Then click "Apply v4–v6" straight away, within a couple of seconds. It succeeds ("Applied through v6"): publishing does not change the engagement's revision, and the decision covers only the v4–v6 you reviewed (`throughVersion`). The page now shows v7 as the pending update, "Summary being prepared…" if you were quick, or already ready if you were slower. Either way, go back to the dashboard and open E-003 again once 3 s have passed since publishing, and v7 is ready.

"Reset demo data" in the panel restores the seed.

Seed data in short: three templates (T-AUDIT latest v6, T-ICR latest v3 with v3 stuck in preparing, T-TAX latest v2) and eight engagements. E-001 and E-008 are up to date, E-004 is declined, E-006 has no status row yet ("Not yet checked"), and E-002, E-003, E-005 and E-007 are pending.

## 3. Architecture

```
src/app/
  contracts/            Zod schemas + inferred types (the API contract); index.ts re-exports
  data/                 engagement-api.ts: httpResource factories + decide()
  features/dashboard/   dashboard page + dashboard-logic.ts (sort, labels)
  features/review/      review page + review-view-model.ts
  demo-panel/           demo panel component (talks to /api/_demo/* over HTTP)
  fake-backend/
    domain/             rules.ts: computeState, validateDecision, applyDecision (pure)
    store.ts            FakeBackendStore (in-memory state, returns Result values)
    seed.ts             deterministic seed data
    interceptor.ts      fakeBackendInterceptor: routes /api/* to the store
    provide-fake-backend.ts  provider helpers + config tokens
  app.config.ts         the only app file allowed to import from fake-backend/
```

Decisions live in pure functions (`rules.ts`, `review-view-model.ts`, `dashboard-logic.ts`) and the components stay thin. Types are inferred from the Zod schemas and never redefined by hand.

**HTTP boundary.** The fake backend is server code that happens to live in this repo. App code reaches it over HTTP only. `eslint.config.js` enforces this with `no-restricted-imports` on `src/app/**/*.ts`, excluding `src/app/fake-backend/**` and `src/app/app.config.ts`. Importing `**/fake-backend` or `**/fake-backend/**` anywhere else fails lint with:

> App code talks to the backend over HTTP only. Only app.config.ts may wire the fake backend.

Removing `fakeBackendInterceptor` from `withInterceptors(...)` and deleting `provideFakeBackend()` in `app.config.ts` would point the app at a real API; no other file changes.

## 4. Correctness decisions

- **Discriminated unions.** `EngagementStatus` and `VersionSummary` are Zod discriminated unions (`contracts/`), so impossible states (an up-to-date engagement with a pending count, a preparing summary with items) cannot be represented.
- **Validation at the boundary.** Every response is parsed with its Zod schema, reads through `httpResource`'s `parse` option and decision responses through `safeParse`. Cross-field rules are checked too, including traceability: every `diffRef` of a change item must exist in that summary's `diff`, and diff ids must be unique. A violation is logged with `console.error('[contract]', ...)` and shown as an error state, never rendered half-trusted.
- **A separate `declined` state.** An engagement declined through the latest version but still on an old one is `declined`, not `up-to-date`, so it never looks current (`computeState` in `fake-backend/domain/rules.ts`).
- **`expectedRevision`.** Each decision carries the revision the user saw. The server returns 409 on any mismatch, which catches a colleague's decline that does not change the current version, something a version comparison would miss (`validateDecision`).
- **`throughVersion`.** A decision covers only the versions the user reviewed, so a version published mid-review is not applied or declined unseen.
- **No decisions through a version whose summary is not ready.** The server answers 422 `SUMMARY_NOT_READY`, and the review page offers decisions only through the last version of an unbroken run of ready summaries (`review-view-model.ts`), with a note about what it is waiting for.

## 5. Trade-offs

- **`httpResource` for reads.** It became public API in Angular 22 and fits signal-based pages well, with the Zod schema plugged into `parse`. The cost is adopting the newest resource API: fewer established patterns to lean on, and behaviour to know about. For example `value()` throws in the error state, which is why every read is guarded with `hasValue()`. Writes use `HttpClient` and parse the response with the schema as well.
- **No NgRx.** Server state lives in resources and UI state in a few signals. A store would add indirection without solving a problem this size has.
- **Plain CSS.** No component library or utility framework; the UI is small, and it avoids a dependency that would not show anything about the design.

## 6. Testing

Vitest through `@angular/build:unit-test`. The last single run passed 205 tests in 10 spec files, with none skipped.

| Spec | Covers |
|---|---|
| `fake-backend/domain/rules.spec.ts` | Table-driven `computeState`, `validateDecision` (conflict, version bounds, not-ready summaries) and `applyDecision` |
| `features/review/review-view-model.spec.ts` | Table-driven view model: flagged versions, decide-through run, apply/decline gates and reasons |
| `features/dashboard/dashboard-logic.spec.ts` | Table-driven sorting, state labels and summary line |
| `contracts/contracts.spec.ts` | Schemas, including the traceability and pending-count refinements |
| `fake-backend/interceptor.spec.ts` | Integration through a real `HttpClient`: reads, changes, decisions, demo endpoints, unknown routes, error shapes |
| `fake-backend/store.spec.ts` | Colleague decisions and the publish timer (ready after the delay, reset and destroy clear timers) |
| `fake-backend/seed.spec.ts` | Seed is served in full, covers the edge cases, and returns fresh copies |
| `data/engagement-api.spec.ts` | `EngagementApi` with `HttpTestingController`: every `decide()` result kind, contract violations on reads |
| `features/dashboard/dashboard.page.spec.ts`, `features/review/review.page.spec.ts` | Component tests: dashboard ordering and links; review page conflict alert with no second POST; decisions stopping at the last ready version. The review spec also covers `decisionOutcome` and `rangeLabel` |

No browser end-to-end tests.

## 7. How this was built

- The design and spec were worked out in conversation with Claude.
- `CLAUDE.md` in this repo is the brief.
- Claude Code executed it with subagent-driven development: an implementer subagent and a reviewer subagent per task.
- Every task was reviewed and committed by hand.
- Git write commands are denied in `.claude/settings.json`.

## 8. Out of scope and next steps

Not built, on purpose:

- A real backend, AWS services, or persistence (data resets on reload).
- Authentication, multiple firms, or users beyond the simulated colleague.
- Generating summaries or calling an LLM.
- Actually applying template content.
- The catalog-unavailable fallback.
- Browser end-to-end tests.
- Component libraries, NgRx, or i18n.

Next steps:

- A net summary across versions, so a user deciding through v6 reads one combined change instead of several stacked ones.
- A real backend behind the same contracts, replacing the interceptor. The boundary rule is there to make that a change in `app.config.ts` only.
