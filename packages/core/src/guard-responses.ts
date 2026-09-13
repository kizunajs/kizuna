import { z } from 'zod';
import type { ResponseDefinition, Routes } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import { authenticationChallenge, resolveSecurityRequirements } from './security-scheme.js';
import { flattenRoutes } from './handler-pipeline.js';
import { ProblemDetailsSchema } from './error-response.js';
import { isZodSchema, resolveResponseBody } from './generator-utils.js';

/**
 * Every hand-written error response points at the one shared
 * `ProblemDetailsSchema`, so identity cannot say who wrote a response.
 */
const INJECTED: unique symbol = Symbol('ts-kizuna.guardResponse');
const WIDENED: unique symbol = Symbol('ts-kizuna.guardResponse.declared');

const carries = (response: ResponseDefinition, mark: symbol): boolean =>
    typeof response === 'object' && response !== null && mark in (response as Record<symbol, unknown>);

const asDeclared = (response: ResponseDefinition): ResponseDefinition =>
    carries(response, WIDENED) ? ((response as Record<symbol, unknown>)[WIDENED] as ResponseDefinition) : response;

/**
 * An API key is not HTTP authentication and has no challenge to send.
 */
const challengeHeaders = (schemes: string[], identities: Record<string, SecurityScheme> | undefined): z.ZodType | undefined => {
    const challenged = schemes.filter((scheme) => authenticationChallenge(identities?.[scheme]) !== undefined);
    if (challenged.length === 0) return undefined;
    const value = z.string();
    return z.object({
        'www-authenticate': challenged.length === schemes.length ? value : value.optional(),
    });
};

/**
 * RFC 9111: a refusal to an authorized request is never stored.
 */
const guardResponse = (body: z.ZodType, headers?: z.ZodType): ResponseDefinition =>
    Object.defineProperty(
        {
            body,
            cache: 'no-store',
            ...(headers ? { headers } : {}),
        },
        INJECTED,
        {
            value: true,
        }
    ) as ResponseDefinition;

const widened = (declared: ResponseDefinition, guardBody: z.ZodType): ResponseDefinition => {
    const body = resolveResponseBody(declared);
    if (body === undefined) return declared;
    return Object.defineProperty(
        {
            ...(isZodSchema(declared) ? {} : declared),
            body: z.union([body, guardBody]),
        },
        WIDENED,
        {
            value: declared,
        }
    ) as ResponseDefinition;
};

/**
 * Give every guarded route the `401` and `403` its guard answers with. A `401`
 * is the guard's alone; a `403` can also come from the handler, so a declared
 * one widens to carry either body.
 *
 * Runs unconditionally, and writes a fresh `responses`, so a routes tree reused
 * across contracts neither keeps a stale injection nor leaks one sideways.
 */
export const injectGuardResponses = (routes: Routes, identities?: Record<string, SecurityScheme>, guardSchema?: z.ZodType): void => {
    const guardBody = guardSchema ?? ProblemDetailsSchema;
    for (const { route, routeKey } of flattenRoutes(routes)) {
        const declared = Object.entries(route.responses)
            .filter(([, response]) => !carries(response, INJECTED))
            .map(([status, response]): [number, ResponseDefinition] => [Number(status), asDeclared(response)]);
        const schemes = resolveSecurityRequirements(route).map((requirement) => requirement.scheme);

        if (schemes.length === 0) {
            route.responses = Object.fromEntries(declared);
            continue;
        }

        if (declared.some(([status]) => status === 401)) {
            throw new Error(
                `Route '${routeKey}' declares a 401, which the auth map already gives it. A guard is what refuses an unauthenticated caller, so remove the declaration.`
            );
        }

        const responses: Record<number, ResponseDefinition> = Object.fromEntries(
            declared.map(([status, response]) => [status, status === 403 ? widened(response, guardBody) : response])
        );
        responses[401] = guardResponse(guardBody, challengeHeaders(schemes, identities));
        responses[403] ??= guardResponse(guardBody);
        route.responses = responses;
    }
};
