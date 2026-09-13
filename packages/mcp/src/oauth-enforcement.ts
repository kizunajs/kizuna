import type { z } from 'zod';
import { problemDetails, problemFromBody, type SecurityScheme } from '@ts-kizuna/core';
import {
    bearerChallenge,
    extractCredential,
    guardDenyFor,
    withPermissions,
    isGuardDenial,
    rawResponse,
    type AdapterRequest,
    type GuardDenialBody,
    type GuardRun,
} from '@ts-kizuna/core/adapter';

const forbiddenBody = (guardSchema: z.ZodType | undefined, detail: string): GuardDenialBody => {
    const filled = guardSchema?.safeParse(problemDetails(403, detail));
    return filled?.success ? (filled.data as GuardDenialBody) : { detail };
};

export interface OAuthDenial {
    status: number;
    body: GuardDenialBody;
    challenge?: string;
}

export interface EnforceOAuthArgs {
    scheme: string;
    guardSchema?: z.ZodType;
    guard: GuardRun;
    schemeDefinition: SecurityScheme;
    metadataUrl: string;
    scopesSupported: readonly string[] | undefined;
    scopes: readonly string[];
    params: Record<string, string>;
    headers: Record<string, string | string[] | undefined>;
    handlerContext: Record<string, unknown>;
    /**
     * The request context the endpoint's own pipeline already resolved, so the
     * transport guard reads the same values a route guard does.
     */
    requestContext: Record<string, unknown> | undefined;
}

const joined = (scopes: readonly string[]): string | undefined => (scopes.length > 0 ? scopes.join(' ') : undefined);

/**
 * Run the oauth guard for one transport request and answer the verified
 * context, or the HTTP denial the MCP authorization specification requires.
 */
export const enforceOAuth = async (
    args: EnforceOAuthArgs
): Promise<{ ok: true; context: Record<string, unknown> | undefined } | { ok: false; denial: OAuthDenial }> => {
    const credentialRequest = {
        headers: args.headers,
        query: {},
    } as unknown as AdapterRequest<unknown>;
    const credential = extractCredential(args.schemeDefinition, credentialRequest);
    const presented = Object.values(credential).some((value) => value !== null);

    const guardResult = await args.guard({
        ...args.handlerContext,
        ...credential,
        params: args.params,
        deny: guardDenyFor(args.schemeDefinition),
        scopes: [...args.scopes],
        ...(args.requestContext && Object.keys(args.requestContext).length > 0
            ? {
                  requestContext: args.requestContext,
              }
            : {}),
    } as Parameters<GuardRun>[0]);

    if (isGuardDenial(guardResult)) {
        const challenge =
            guardResult.status === 401
                ? bearerChallenge({
                      ...(presented
                          ? {
                                error: 'invalid_token',
                                error_description: guardResult.body.detail,
                            }
                          : {}),
                      resource_metadata: args.metadataUrl,
                      scope: joined(args.scopes) ?? joined(args.scopesSupported ?? []),
                  })
                : guardResult.status === 403
                  ? bearerChallenge({
                        error: 'insufficient_scope',
                        scope: joined(args.scopes),
                        resource_metadata: args.metadataUrl,
                    })
                  : undefined;
        return {
            ok: false,
            denial: {
                status: guardResult.status,
                body: guardResult.body,
                challenge,
            },
        };
    }

    const context =
        guardResult && typeof guardResult === 'object' ? withPermissions(args.scheme, args.schemeDefinition, guardResult) : undefined;
    return {
        ok: true,
        context: context as Record<string, unknown> | undefined,
    };
};

export const denialResponse = (denial: OAuthDenial): ReturnType<typeof rawResponse> =>
    rawResponse(
        new Response(JSON.stringify(problemFromBody(denial.status, denial.body)), {
            status: denial.status,
            headers: {
                'content-type': 'application/problem+json',
                ...(denial.challenge === undefined
                    ? {}
                    : {
                          'www-authenticate': denial.challenge,
                      }),
            },
        })
    );
