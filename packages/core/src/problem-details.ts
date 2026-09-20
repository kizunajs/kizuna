import type { z } from 'zod';
import { statusTitle } from './status-titles.js';

export interface ProblemDetails {
    type: string;
    title: string;
    status: number;
    detail: string;
}

/**
 * Build an RFC 9457 Problem Details body.
 *
 * ```ts
 * import { problemDetails } from '@ts-kizuna/core';
 *
 * return throwError({
 *     status: 404,
 *     body: problemDetails(404, 'User not found'),
 * });
 * ```
 */
export const problemDetails = <T extends Record<string, unknown> = Record<string, never>>(
    status: number,
    detail: string,
    extensions?: T
): ProblemDetails & T => ({
    type: 'about:blank',
    title: statusTitle(status) ?? 'Unknown Error',
    status,
    detail,
    ...((extensions as T) ?? ({} as T)),
});

/**
 * Strips the RFC 9457 envelope fields the adapter auto-fills (`type`/`title`/`status`),
 * leaving the author to supply `detail` plus any extension members. `type` stays optional
 * (authors may point it at their own problem-type URI); `title`/`status` are forbidden.
 */
export type StripProblemEnvelope<T extends ProblemDetails> = Omit<T, 'type' | 'title' | 'status'> &
    Partial<Pick<T, 'type'>> & { title?: never; status?: never };

/**
 * The body `deny` takes. An api declaring no `guardSchema` leaves it at `detail`.
 */
export type GuardBody<Schema> = [Schema] extends [never]
    ? { detail: string }
    : Schema extends z.ZodType
      ? z.input<Schema> extends ProblemDetails
          ? StripProblemEnvelope<z.input<Schema>>
          : { detail: string }
      : { detail: string };

/**
 * Applied as `guardSchema?: Schema & GuardSchemaCheck<Schema>`: a schema that
 * extends the envelope gives `unknown`, anything else resolves to an error
 * message at the declaration site.
 */
export type GuardSchemaCheck<Schema> = Schema extends z.ZodType
    ? z.input<Schema> extends ProblemDetails
        ? unknown
        : 'The `guardSchema` must extend `ProblemDetailsSchema`. Every response at 400 or above is RFC 9457 Problem Details.'
    : unknown;

export type GuardOutput<Schema> = Schema extends z.ZodType ? z.output<Schema> : ProblemDetails;

/**
 * An RFC 9457 body from a `{ detail, ...extensions }` body, filling the envelope.
 */
export const problemFromBody = (status: number, body: unknown): ProblemDetails & Record<string, unknown> => {
    const extensions = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const detail = typeof extensions.detail === 'string' ? extensions.detail : (statusTitle(status) ?? 'Error');
    return problemDetails(status, detail, extensions);
};
