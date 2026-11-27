import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { verifyJwt } from './verify-jwt.js';

const k = new Kizuna();

const jwks = 'https://auth.example.com/.well-known/jwks.json';
const issuer = 'https://auth.example.com';
const audience = 'https://api.example.com';

test('fits a bearer, oauth2 and openIdConnect identity', () => {
    const guard = verifyJwt({
        jwks,
        issuer,
        audience,
        algorithms: ['RS256'],
        claims: z.object({
            sub: z.string(),
        }),
        context: ({ claims }) => ({
            userId: claims.sub,
        }),
    });
    const context = z.object({
        userId: z.string(),
    });

    k.identity
        .bearer({
            context,
        })
        .guard(guard);
    k.identity
        .oauth2({
            flows: {},
            context,
        })
        .guard(guard);
    k.identity
        .openIdConnect({
            openIdConnectUrl: `${issuer}/.well-known/openid-configuration`,
            context,
        })
        .guard(guard);
});

test('types the claims from the schema', () => {
    verifyJwt({
        jwks,
        issuer,
        audience,
        algorithms: ['ES256'],
        claims: z.object({
            sub: z.string(),
            roles: z.array(z.string()).default([]),
        }),
        context: ({ claims }) => {
            expectTypeOf(claims).toEqualTypeOf<{
                sub: string;
                roles: string[];
            }>();
            return {};
        },
    });
});

test('refuses a context that does not match the identity', () => {
    k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
        })
        .guard(
            // @ts-expect-error the identity's context has userId, not id
            verifyJwt({
                jwks,
                issuer,
                audience,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: ({ claims }) => ({
                    id: claims.sub,
                }),
            })
        );
});

test('returns a role the identity declares', () => {
    const permissions = Kizuna.permissions({
        users: ['read', 'write'],
    });
    const roles = Kizuna.roles(permissions, {
        member: {
            users: ['read'],
        },
        admin: 'all',
    });

    k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
            roles,
        })
        .guard(
            verifyJwt({
                jwks,
                issuer,
                audience,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                    role: z.enum(['member', 'admin']),
                }),
                context: ({ claims }) => ({
                    userId: claims.sub,
                    role: claims.role,
                }),
            })
        );
});

test('returns the scopes a token holds as permissions', () => {
    const permissions = Kizuna.permissions({
        users: ['read', 'write'],
    });
    const roles = Kizuna.roles(permissions, {
        member: {
            users: ['read'],
        },
        admin: 'all',
    });

    k.identity
        .oauth2({
            flows: {},
            context: z.object({
                userId: z.string(),
            }),
            roles,
        })
        .guard(
            verifyJwt({
                jwks,
                issuer,
                audience,
                algorithms: ['RS256'],
                claims: z.object({
                    sub: z.string(),
                    role: z.enum(['member', 'admin']).default('member'),
                    scope: z.string().default(''),
                }),
                context: ({ claims }) => ({
                    userId: claims.sub,
                    role: claims.role,
                    permissions: permissions.names.filter((name) => claims.scope.split(' ').includes(name)),
                }),
            })
        );
});

test('returns several roles the identity declares', () => {
    const roles = Kizuna.roles(['member', 'admin']);

    k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
            roles,
        })
        .guard(
            verifyJwt({
                jwks,
                issuer,
                audience,
                algorithms: ['RS256'],
                claims: z.object({
                    oid: z.string(),
                    roles: z.array(z.string()).default([]),
                }),
                context: ({ claims }) => ({
                    userId: claims.oid,
                    role: roles.names.filter((name) => claims.roles.includes(name)),
                }),
            })
        );
});

test('refuses a role the identity does not declare', () => {
    const permissions = Kizuna.permissions({
        users: ['read'],
    });
    const roles = Kizuna.roles(permissions, {
        member: {
            users: ['read'],
        },
    });

    k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
            roles,
        })
        .guard(
            // @ts-expect-error 'owner' is not one of the identity's roles
            verifyJwt({
                jwks,
                issuer,
                audience,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: ({ claims }) => ({
                    userId: claims.sub,
                    role: 'owner',
                }),
            })
        );
});

test('only takes public-key algorithms with a JWKS, and shared-secret ones with a secret', () => {
    const claims = z.object({
        sub: z.string(),
    });
    const context = () => ({});

    // @ts-expect-error HS256 cannot verify against a JWKS
    verifyJwt({
        jwks,
        issuer,
        audience,
        algorithms: ['HS256'],
        claims,
        context,
    });
    // @ts-expect-error RS256 cannot verify with a secret
    verifyJwt({
        secret: 'a-shared-secret-of-at-least-32-bytes!',
        issuer,
        audience,
        algorithms: ['RS256'],
        claims,
        context,
    });
    // @ts-expect-error jwks and secret cannot both be set
    verifyJwt({
        jwks,
        secret: 'a-shared-secret-of-at-least-32-bytes!',
        issuer,
        audience,
        algorithms: ['HS256'],
        claims,
        context,
    });
});

test('fits a config whose guard schema adds fields with defaults', () => {
    const GuardSchema = Kizuna.model({
        title: 'GuardDenial',
        schema: ProblemDetailsSchema.extend({
            code: z.enum(['unauthenticated', 'forbidden']).default('forbidden'),
        }),
    });
    const kizuna = new Kizuna<{
        auth: {
            guardSchema: typeof GuardSchema;
        };
    }>();

    kizuna.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
        })
        .guard(
            verifyJwt({
                jwks,
                issuer,
                audience,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: ({ claims }) => ({
                    userId: claims.sub,
                }),
            })
        );
});
