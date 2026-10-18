import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { Injectable, Injector, Signal, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import * as z from 'zod';
import {
  ApiError,
  ApiErrorSchema,
  EngagementStatus,
  EngagementStatusSchema,
  UpdateDecision,
  VersionSummarySchema,
} from '../contracts';

export type DecisionResult =
  | { kind: 'ok'; status: EngagementStatus }
  | { kind: 'conflict' }
  | {
      kind: 'rejected';
      code: Extract<
        ApiError['code'],
        'INVALID_THROUGH_VERSION' | 'SUMMARY_NOT_READY' | 'BAD_REQUEST'
      >;
    }
  | { kind: 'not-found' }
  | { kind: 'contract' }
  | { kind: 'network' };

type RejectedCode = Extract<DecisionResult, { kind: 'rejected' }>['code'];

function isRejectedCode(code: ApiError['code']): code is RejectedCode {
  return (
    code === 'INVALID_THROUGH_VERSION' || code === 'SUMMARY_NOT_READY' || code === 'BAD_REQUEST'
  );
}

function logContract(issues: z.core.$ZodIssue[]): void {
  console.error('[contract]', issues);
}

/** Schema parse that logs contract violations before rethrowing. */
function parseLogged<T>(schema: z.ZodType<T>): (raw: unknown) => T {
  return (raw) => {
    try {
      return schema.parse(raw);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logContract(error.issues);
      }
      throw error;
    }
  };
}

const EngagementListSchema = z.array(EngagementStatusSchema);
const VersionSummaryListSchema = z.array(VersionSummarySchema);

@Injectable({ providedIn: 'root' })
export class EngagementApi {
  private readonly http = inject(HttpClient);

  engagements(injector?: Injector) {
    return httpResource(() => '/api/engagements', {
      parse: parseLogged(EngagementListSchema),
      injector,
    });
  }

  engagement(id: Signal<string>, injector?: Injector) {
    return httpResource(() => `/api/engagements/${encodeURIComponent(id())}`, {
      parse: parseLogged(EngagementStatusSchema),
      injector,
    });
  }

  changes(
    templateId: Signal<string | undefined>,
    after: Signal<number | undefined>,
    injector?: Injector,
  ) {
    return httpResource(
      () => {
        const template = templateId();
        const afterVersion = after();
        if (template === undefined || afterVersion === undefined) {
          return undefined;
        }
        return {
          url: `/api/templates/${encodeURIComponent(template)}/changes`,
          params: { after: afterVersion },
        };
      },
      { parse: parseLogged(VersionSummaryListSchema), injector },
    );
  }

  async decide(engagementId: string, decision: UpdateDecision): Promise<DecisionResult> {
    try {
      const body = await firstValueFrom(
        this.http.post<unknown>(
          `/api/engagements/${encodeURIComponent(engagementId)}/decision`,
          decision,
        ),
      );
      const parsed = EngagementStatusSchema.safeParse(body);
      if (!parsed.success) {
        logContract(parsed.error.issues);
        return { kind: 'contract' };
      }
      return { kind: 'ok', status: parsed.data };
    } catch (error) {
      if (!(error instanceof HttpErrorResponse)) {
        return { kind: 'network' };
      }
      if (![400, 404, 409, 422].includes(error.status)) {
        return { kind: 'network' };
      }
      const parsed = ApiErrorSchema.safeParse(error.error);
      if (!parsed.success) {
        logContract(parsed.error.issues);
        return { kind: 'contract' };
      }
      const code = parsed.data.code;
      if (error.status === 409) {
        return { kind: 'conflict' };
      }
      if (error.status === 404) {
        return { kind: 'not-found' };
      }
      if (isRejectedCode(code)) {
        return { kind: 'rejected', code };
      }
      console.error('[contract]', [
        { message: `unexpected error code ${code} for ${error.status}` },
      ]);
      return { kind: 'contract' };
    }
  }
}
