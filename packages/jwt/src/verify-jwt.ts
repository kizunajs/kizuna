import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { z } from 'zod';
import type { BearerCredential } from 'kizunajs';
import type { GuardDeny, GuardDenial } from 'kizunajs/adapter';

/**
 * A signing algorithm a provider's public keys use.
 */
export type AsymmetricAlgorithm =
    'RS256' | 'RS384' | 'RS512' | 'PS256' | 'PS384' | 'PS512' | 'ES256' | 'ES384' | 'ES512' | 'EdDSA' | 'Ed25519';

/**
 * A signing algorithm a shared secret uses.
 */
export type SymmetricAlgorithm = 'HS256' | 'HS384' | 'HS512';

const ASYMMETRIC_ALGORITHMS: ReadonlySet<string> = new Set<AsymmetricAlgorithm>([
    'RS256',
    'RS384',
    'RS512',
    'PS256',
    'PS384',
    'PS512',
    'ES256',
    'ES384',
    'ES512',
    'EdDSA',
    'Ed25519',
]);

// RFC 7518 section 3.2: an HMAC key is at least as long as the hash output.
const SECRET_BYTES: Record<SymmetricAlgorithm, number> = {
    HS256: 32,
    HS384: 48,
    HS512: 64,
};

// What jose throws for a token that fails. Anything else, like a JWKS that cannot be fetched, is the server's fault.
const TOKEN_ERRORS: ReadonlySet<string> = new Set([
    'ERR_JWT_EXPIRED',
    'ERR_JWT_CLAIM_VALIDATION_FAILED',
    'ERR_JWT_INVALID',
    'ERR_JWS_INVALID',
    'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
    'ERR_JOSE_ALG_NOT_ALLOWED',
    'ERR_JOSE_NOT_SUPPORTED',
    'ERR_JWKS_NO_MATCHING_KEY',
    'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
]);

const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Where the provider's public keys come from: its JWKS URL, and the algorithms its keys sign with.
 */
interface JwksSource {
    /**
     * The URL of the provider's public keys. It is https, or http on localhost. `undefined`, like an unset environment variable, is checked on the first request instead.
     *
     * @example
     * jwks: 'https://auth.example.com/.well-known/jwks.json',
     */
    jwks: string | URL | undefined;
    secret?: never;
    /**
     * The algorithms a token may be signed with.
     *
     * @example
     * algorithms: ['ES256'],
     */
    algorithms: readonly AsymmetricAlgorithm[];
}

/**
 * A secret shared with the provider, and the algorithms it signs with.
 */
interface SecretSource {
    jwks?: never;
    /**
     * The secret the provider signs tokens with. It is at least as long as each algorithm needs: 32 bytes for HS256, 48 for HS384 and 64 for HS512. `undefined`, like an unset environment variable, is checked on the first request instead.
     *
     * @example
     * secret: process.env.JWT_SECRET,
     */
    secret: string | Uint8Array | undefined;
    /**
     * The algorithms a token may be signed with.
     *
     * @example
     * algorithms: ['HS256'],
     */
    algorithms: readonly SymmetricAlgorithm[];
}

/**
 * The `deny` a guard receives, which refuses the request with Problem Details.
 */
export type JwtDeny = GuardDeny<{
    detail: string;
}>;

/**
 * What `verifyJwt` checks a token against, and how its claims become the identity's context.
 */
export type VerifyJwtOptions<ClaimsSchema extends z.ZodType, Context> = (JwksSource | SecretSource) & {
    /**
     * The `iss` every token carries, the provider's issuer identifier.
     *
     * @example
     * issuer: 'https://auth.example.com',
     */
    issuer: string | undefined;
    /**
     * The `aud` a token has to name, usually your API's identifier at the provider. A list accepts a token naming any of them.
     *
     * @example
     * audience: 'https://api.example.com',
     */
    audience: string | readonly string[] | undefined;
    /**
     * The claims a token has to carry, checked after its signature.
     *
     * @example
     * claims: z.object({
     *     sub: z.string(),
     * }),
     */
    claims: ClaimsSchema;
    /**
     * Turns a verified token's claims into the identity's context, with its `role` and `permissions` when it declares roles. It may call `deny`, like any guard.
     *
     * @example
     * context: ({ claims }) => ({
     *     userId: claims.sub,
     * }),
     */
    context: (args: { claims: z.output<ClaimsSchema>; deny: JwtDeny }) => Context | GuardDenial | Promise<Context | GuardDenial>;
    /**
     * How far a token's `exp` and `nbf` may be off from this server's clock, in seconds or as a string like `'30s'`.
     *
     * @default 0 seconds
     */
    clockTolerance?: number | string;
};

/**
 * What a guard `verifyJwt` builds reads: the token from a `bearer`, `oauth2` or `openIdConnect` identity, and `deny`.
 */
export interface JwtGuardArgs {
    /**
     * The token a `bearer` identity reads from the `Authorization` header.
     */
    bearer?: BearerCredential | null;
    /**
     * The token an `oauth2` identity reads from the `Authorization` header.
     */
    oauth2?: BearerCredential | null;
    /**
     * The token an `openIdConnect` identity reads from the `Authorization` header.
     */
    openIdConnect?: BearerCredential | null;
    /**
     * Refuses the request with Problem Details.
     */
    deny: JwtDeny;
}

const assertKeyUrl = (value: string | URL): URL => {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`verifyJwt: the jwks "${String(value)}" is not an absolute URL.`);
    }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(parsed.hostname))) {
        throw new Error(`verifyJwt: the jwks "${parsed.href}" must be https. http is only allowed on localhost.`);
    }
    return parsed;
};

const assertAlgorithms = (options: JwksSource | SecretSource): void => {
    if ('jwks' in options === 'secret' in options) {
        throw new Error('verifyJwt: pass either `jwks` or `secret`.');
    }
    if (!Array.isArray(options.algorithms) || options.algorithms.length === 0) {
        throw new Error('verifyJwt: `algorithms` names at least one algorithm.');
    }
    for (const algorithm of options.algorithms) {
        if ('jwks' in options && !ASYMMETRIC_ALGORITHMS.has(algorithm)) {
            throw new Error(`verifyJwt: "${algorithm}" cannot verify against a JWKS. Use a public-key algorithm, like RS256 or ES256.`);
        }
        if ('secret' in options && SECRET_BYTES[algorithm as SymmetricAlgorithm] === undefined) {
            throw new Error(`verifyJwt: "${algorithm}" cannot verify with a secret. Use HS256, HS384 or HS512.`);
        }
    }
};

const keyOf = (options: JwksSource | SecretSource): JWTVerifyGetKey | Uint8Array => {
    if (options.jwks !== undefined) return createRemoteJWKSet(assertKeyUrl(options.jwks));
    const secret = typeof options.secret === 'string' ? new TextEncoder().encode(options.secret) : options.secret!;
    for (const algorithm of options.algorithms as readonly SymmetricAlgorithm[]) {
        if (secret.byteLength < SECRET_BYTES[algorithm]) {
            throw new Error(
                `verifyJwt: ${algorithm} needs a secret of at least ${SECRET_BYTES[algorithm]} bytes, and this one has ${secret.byteLength}.`
            );
        }
    }
    return secret;
};

type KeyOptions = (JwksSource | SecretSource) & {
    issuer: string | undefined;
    audience: string | readonly string[] | undefined;
    clockTolerance?: number | string;
};

const unsetOptionsOf = (options: KeyOptions): string[] =>
    [
        ['jwks' in options ? 'jwks' : 'secret', options.jwks ?? options.secret],
        ['issuer', options.issuer],
        ['audience', options.audience],
    ]
        .filter(([, value]) => value === undefined)
        .map(([name]) => `\`${String(name)}\``);

const verifierOf = (options: KeyOptions) => {
    const unset = unsetOptionsOf(options);
    if (unset.length > 0) {
        throw new Error(
            `verifyJwt: ${unset.join(' and ')} ${unset.length === 1 ? 'is' : 'are'} undefined. Set ${unset.length === 1 ? 'it' : 'them'} before the API takes requests.`
        );
    }
    if (typeof options.issuer !== 'string' || options.issuer === '') {
        throw new Error('verifyJwt: `issuer` is the one issuer your tokens carry.');
    }
    const audience = typeof options.audience === 'string' ? [options.audience] : [...options.audience!];
    if (audience.length === 0 || audience.some((value) => typeof value !== 'string' || value === '')) {
        throw new Error('verifyJwt: `audience` names at least one audience.');
    }
    return {
        key: keyOf(options),
        verifyOptions: {
            issuer: options.issuer,
            audience,
            algorithms: [...options.algorithms],
            requiredClaims: ['exp'],
            clockTolerance: options.clockTolerance,
        },
    };
};

const isTokenError = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && TOKEN_ERRORS.has(String(error.code));

/**
 * Builds a guard that verifies the caller's JWT against your sign-in provider's keys. A token that fails is denied with `401`, and a JWKS that cannot be fetched throws, so the request fails with `500`.
 *
 * @example
 * export const user = k.identity
 *     .bearer({
 *         bearerFormat: 'JWT',
 *         context: z.object({
 *             userId: z.string(),
 *         }),
 *     })
 *     .guard(
 *         verifyJwt({
 *             jwks: 'https://auth.example.com/.well-known/jwks.json',
 *             issuer: 'https://auth.example.com',
 *             audience: 'https://api.example.com',
 *             algorithms: ['ES256'],
 *             claims: z.object({
 *                 sub: z.string(),
 *             }),
 *             context: ({ claims }) => ({
 *                 userId: claims.sub,
 *             }),
 *         })
 *     );
 */
export const verifyJwt = <ClaimsSchema extends z.ZodType, Context>(
    options: VerifyJwtOptions<ClaimsSchema, Context>
): ((args: JwtGuardArgs) => Promise<Context | GuardDenial>) => {
    assertAlgorithms(options);
    // `kizuna generate` loads no environment, so an option read from it may be undefined until the API takes requests.
    let verifier = unsetOptionsOf(options).length === 0 ? verifierOf(options) : undefined;

    return async ({ bearer, oauth2, openIdConnect, deny }) => {
        const credential = bearer ?? oauth2 ?? openIdConnect ?? null;
        if (credential === null) {
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                },
            });
        }

        verifier ??= verifierOf(options);
        const { key, verifyOptions } = verifier;
        let payload: unknown;
        try {
            const verified =
                typeof key === 'function'
                    ? await jwtVerify(credential.token, key, verifyOptions)
                    : await jwtVerify(credential.token, key, verifyOptions);
            payload = verified.payload;
        } catch (error) {
            if (!isTokenError(error)) throw error;
            return deny({
                status: 401,
                body: {
                    detail: 'Invalid or expired token',
                },
            });
        }

        const claims = options.claims.safeParse(payload);
        if (!claims.success) {
            return deny({
                status: 401,
                body: {
                    detail: 'Invalid or expired token',
                },
            });
        }

        return options.context({
            claims: claims.data,
            deny,
        });
    };
};
