import { InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Response delay applied by the fake backend, in milliseconds. */
export const FAKE_BACKEND_LATENCY_MS = new InjectionToken<number>('FAKE_BACKEND_LATENCY_MS');

/** How long until a demo-published summary flips from `preparing` to `ready`, in milliseconds. */
export const FAKE_SUMMARY_READY_DELAY_MS = new InjectionToken<number>(
  'FAKE_SUMMARY_READY_DELAY_MS',
);

const DEFAULT_LATENCY_MS = 300;
const DEFAULT_SUMMARY_READY_DELAY_MS = 3000;

export interface FakeBackendOptions {
  latencyMs?: number;
  summaryReadyDelayMs?: number;
}

export function provideFakeBackend(options: FakeBackendOptions = {}) {
  return makeEnvironmentProviders([
    { provide: FAKE_BACKEND_LATENCY_MS, useValue: options.latencyMs ?? DEFAULT_LATENCY_MS },
    {
      provide: FAKE_SUMMARY_READY_DELAY_MS,
      useValue: options.summaryReadyDelayMs ?? DEFAULT_SUMMARY_READY_DELAY_MS,
    },
  ]);
}
