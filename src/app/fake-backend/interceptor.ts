import {
  HttpErrorResponse,
  type HttpEvent,
  type HttpInterceptorFn,
  type HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { type Observable, delay, mergeMap, of, throwError } from 'rxjs';
import {
  type ApiError,
  DemoColleagueRequestSchema,
  DemoPublishRequestSchema,
  UpdateDecisionSchema,
} from '../contracts';
import type { Result } from './domain/rules';
import { FAKE_BACKEND_LATENCY_MS } from './provide-fake-backend';
import { FakeBackendStore } from './store';

const ORIGIN = 'http://fake-backend.local';

const STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
};

function failure(status: number, code: ApiError['code'], message: string): Result<never> {
  return { ok: false, status, code, message };
}

function badRequest(message: string): Result<never> {
  return failure(400, 'BAD_REQUEST', message);
}

function notFound(): Result<never> {
  return failure(404, 'NOT_FOUND', 'Route not found.');
}

function decodeSegments(pathname: string): string[] | undefined {
  try {
    return pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return undefined;
  }
}

/** Runs the store call for a request. Returns the status to use on success alongside the result. */
function route(
  req: HttpRequest<unknown>,
  store: FakeBackendStore,
): { result: Result<unknown>; successStatus: number } {
  const url = new URL(req.urlWithParams, ORIGIN);
  const segments = decodeSegments(url.pathname);
  const handled = (result: Result<unknown>, successStatus = 200) => ({ result, successStatus });
  if (!segments) {
    return handled(notFound());
  }
  const [, a, b, c] = segments; // segments[0] is "api"
  const method = req.method;
  const count = segments.length;

  if (method === 'GET' && count === 2 && a === 'engagements') {
    return handled(store.listEngagements());
  }
  if (method === 'GET' && count === 3 && a === 'engagements' && b !== undefined) {
    return handled(store.getEngagement(b));
  }
  if (method === 'GET' && count === 4 && a === 'templates' && c === 'changes' && b !== undefined) {
    const after = url.searchParams.get('after');
    if (after === null || !/^\d+$/.test(after)) {
      return handled(badRequest('Query parameter "after" must be a non-negative integer.'));
    }
    return handled(store.getChanges(b, Number(after)));
  }
  if (
    method === 'POST' &&
    count === 4 &&
    a === 'engagements' &&
    c === 'decision' &&
    b !== undefined
  ) {
    const body = UpdateDecisionSchema.safeParse(req.body);
    if (!body.success) {
      return handled(badRequest('Invalid decision.'));
    }
    return handled(store.decide(b, body.data));
  }
  if (method === 'POST' && count === 3 && a === '_demo' && b === 'publish') {
    const body = DemoPublishRequestSchema.safeParse(req.body);
    if (!body.success) {
      return handled(badRequest('Invalid publish request.'));
    }
    return handled(store.publish(body.data.templateId));
  }
  if (method === 'POST' && count === 3 && a === '_demo' && b === 'colleague-decides') {
    const body = DemoColleagueRequestSchema.safeParse(req.body);
    if (!body.success) {
      return handled(badRequest('Invalid colleague request.'));
    }
    return handled(store.colleagueDecides(body.data.engagementId, body.data.decision));
  }
  if (method === 'POST' && count === 3 && a === '_demo' && b === 'reset') {
    store.reset();
    return handled({ ok: true, value: null }, 204);
  }
  return handled(notFound());
}

export const fakeBackendInterceptor: HttpInterceptorFn = (req, next) => {
  const pathname = new URL(req.url, ORIGIN).pathname;
  if (pathname !== '/api' && !pathname.startsWith('/api/')) {
    return next(req);
  }

  const store = inject(FakeBackendStore);
  const latencyMs = inject(FAKE_BACKEND_LATENCY_MS);
  const { result, successStatus } = route(req, store);

  if (result.ok) {
    return of(new HttpResponse({ status: successStatus, body: result.value })).pipe(
      delay(latencyMs),
    ) as Observable<HttpEvent<unknown>>;
  }
  const error: ApiError = { code: result.code, message: result.message };
  return of(null).pipe(
    delay(latencyMs),
    mergeMap(() =>
      throwError(
        () =>
          new HttpErrorResponse({
            status: result.status,
            statusText: STATUS_TEXT[result.status] ?? 'Error',
            error,
            url: req.urlWithParams,
          }),
      ),
    ),
  );
};
