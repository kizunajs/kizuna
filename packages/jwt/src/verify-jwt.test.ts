import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { exportJWK, exportSPKI, generateKeyPair, SignJWT, type CryptoKey, type JWTPayload } from 'jose';
import { Kizuna, defineConfig } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { verifyJwt } from './verify-jwt.js';

const ISSUER = 'https://auth.example.com';
const AUDIENCE = 'https://api.example.com';
const KEY_ID = 'key-1';
const SECRET = 'a-shared-secret-of-at-least-32-bytes!';

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let publicKeyPem: string;
let keyServer: Server;
let jwksUrl: string;
let jwksStatus = 200;
let app: express.Express;

const signToken = (
    claims: JWTPayload,
    options: {
        key?: CryptoKey | Uint8Array;
        algorithm?: string;
        expiresIn?: string | number;
    } = {}
) => {
    const token = new SignJWT(claims)
        .setProtectedHeader({
            alg: options.algorithm ?? 'ES256',
            kid: KEY_ID,
        })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt();
    if (options.expiresIn !== undefined) token.setExpirationTime(options.expiresIn);
    else token.setExpirationTime('5m');
    return token.sign(options.key ?? signingKey);
};

const encodeSegment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

const buildApp = () => {
    const k = new Kizuna();

    const user = k.identity
        .bearer({
            bearerFormat: 'JWT',
            context: z.object({
                userId: z.string(),
            }),
        })
        .guard(
            verifyJwt({
                jwks: jwksUrl,
                issuer: ISSUER,
                audience: AUDIENCE,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: ({ claims }) => ({
                    userId: claims.sub,
                }),
            })
        );

    const member = k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
        })
        .guard(
            verifyJwt({
                secret: SECRET,
                issuer: ISSUER,
                audience: AUDIENCE,
                algorithms: ['HS256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: ({ claims }) => ({
                    userId: claims.sub,
                }),
            })
        );

    const verifiedUser = k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
        })
        .guard(
            verifyJwt({
                jwks: jwksUrl,
                issuer: ISSUER,
                audience: AUDIENCE,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                    email_verified: z.boolean(),
                }),
                context: ({ claims, deny }) =>
                    claims.email_verified
                        ? {
                              userId: claims.sub,
                          }
                        : deny({
                              status: 403,
                              body: {
                                  detail: 'Verify your email first',
                              },
                          }),
            })
        );

    const delegate = k.identity
        .oauth2({
            flows: {
                clientCredentials: {
                    tokenUrl: 'https://auth.example.com/oauth2/token',
                    scopes: {},
                },
            },
            context: z.object({
                clientId: z.string(),
            }),
        })
        .guard(
            verifyJwt({
                jwks: jwksUrl,
                issuer: ISSUER,
                audience: AUDIENCE,
                algorithms: ['ES256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: ({ claims }) => ({
                    clientId: claims.sub,
                }),
            })
        );

    const callerRoute = (identity: string) =>
        k
            .route({
                method: 'GET',
                path: `/${identity}`,
                auth: identity as 'user',
                responses: {
                    200: z.object({
                        caller: z.unknown(),
                    }),
                },
            })
            .handler(({ auth }) => ({
                status: 200,
                body: {
                    caller: (auth as Record<string, unknown>)[identity],
                },
            }));

    const routes = k.routes({
        readUser: callerRoute('user'),
        readMember: callerRoute('member'),
        readVerifiedUser: callerRoute('verifiedUser'),
        readDelegate: callerRoute('delegate'),
    });

    const { api } = defineConfig({
        adapter: expressAdapter(),
        routes: [routes],
        auth: {
            identities: {
                user,
                member,
                verifiedUser,
                delegate,
            },
        },
    });
    const server = express();
    api.mount(server);
    return server;
};

beforeAll(async () => {
    const pair = await generateKeyPair('ES256', {
        extractable: true,
    });
    signingKey = pair.privateKey;
    otherKey = (await generateKeyPair('ES256')).privateKey;
    publicKeyPem = await exportSPKI(pair.publicKey);
    // Served without `alg`, as many providers do, which is what let an algorithm confusion through elsewhere.
    const publicJwk = {
        ...(await exportJWK(pair.publicKey)),
        kid: KEY_ID,
    };

    keyServer = createServer((_request, response) => {
        response.writeHead(jwksStatus, {
            'content-type': 'application/json',
        });
        response.end(
            JSON.stringify({
                keys: [publicJwk],
            })
        );
    });
    await new Promise<void>((resolve) => keyServer.listen(0, '127.0.0.1', resolve));
    jwksUrl = `http://127.0.0.1:${(keyServer.address() as AddressInfo).port}/.well-known/jwks.json`;
    app = buildApp();
});

afterAll(async () => {
    await new Promise((resolve) => keyServer.close(resolve));
});

beforeEach(() => {
    jwksStatus = 200;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const callWith = (path: string, token: string) => request(app).get(path).set('authorization', `Bearer ${token}`);

describe('verifyJwt', () => {
    it('lets a token signed by the provider through, with its claims as the context', async () => {
        const response = await callWith(
            '/user',
            await signToken({
                sub: 'user-1',
            })
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            caller: {
                userId: 'user-1',
            },
        });
    });

    it('answers 401 with the challenge when there is no token', async () => {
        const response = await request(app).get('/user');

        expect(response.status).toBe(401);
        expect(response.headers['www-authenticate']).toMatch(/^Bearer/);
        expect(response.body.detail).toBe('Unauthorized');
    });

    it('refuses an unsigned token', async () => {
        const unsigned = `${encodeSegment({
            alg: 'none',
            typ: 'JWT',
        })}.${encodeSegment({
            sub: 'user-1',
            iss: ISSUER,
            aud: AUDIENCE,
            exp: Math.floor(Date.now() / 1000) + 300,
        })}.`;

        const response = await callWith('/user', unsigned);

        expect(response.status).toBe(401);
        expect(response.body.detail).toBe('Invalid or expired token');
    });

    it('refuses an HS256 token signed with the public key', async () => {
        const forged = await signToken(
            {
                sub: 'user-1',
            },
            {
                key: new TextEncoder().encode(publicKeyPem),
                algorithm: 'HS256',
            }
        );

        expect((await callWith('/user', forged)).status).toBe(401);
    });

    it('refuses a token signed by another key under the same key id', async () => {
        const forged = await signToken(
            {
                sub: 'user-1',
            },
            {
                key: otherKey,
            }
        );

        expect((await callWith('/user', forged)).status).toBe(401);
    });

    it('refuses a tampered payload', async () => {
        const [header, , signature] = (
            await signToken({
                sub: 'user-1',
            })
        ).split('.');
        const tampered = `${header}.${encodeSegment({
            sub: 'admin',
            iss: ISSUER,
            aud: AUDIENCE,
            exp: Math.floor(Date.now() / 1000) + 300,
        })}.${signature}`;

        expect((await callWith('/user', tampered)).status).toBe(401);
    });

    it('refuses a token from another issuer', async () => {
        const token = await new SignJWT({
            sub: 'user-1',
        })
            .setProtectedHeader({
                alg: 'ES256',
                kid: KEY_ID,
            })
            .setIssuer('https://evil.example.com')
            .setAudience(AUDIENCE)
            .setExpirationTime('5m')
            .sign(signingKey);

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses an issuer sent as a list', async () => {
        const token = await new SignJWT({
            sub: 'user-1',
            iss: [ISSUER, 'https://evil.example.com'] as never,
        })
            .setProtectedHeader({
                alg: 'ES256',
                kid: KEY_ID,
            })
            .setAudience(AUDIENCE)
            .setExpirationTime('5m')
            .sign(signingKey);

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses a token for another audience', async () => {
        const token = await new SignJWT({
            sub: 'user-1',
        })
            .setProtectedHeader({
                alg: 'ES256',
                kid: KEY_ID,
            })
            .setIssuer(ISSUER)
            .setAudience('https://other-api.example.com')
            .setExpirationTime('5m')
            .sign(signingKey);

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses an expired token', async () => {
        const token = await signToken(
            {
                sub: 'user-1',
            },
            {
                expiresIn: Math.floor(Date.now() / 1000) - 10,
            }
        );

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses a token that is not valid yet', async () => {
        const token = await new SignJWT({
            sub: 'user-1',
        })
            .setProtectedHeader({
                alg: 'ES256',
                kid: KEY_ID,
            })
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .setNotBefore('5m')
            .setExpirationTime('10m')
            .sign(signingKey);

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses a token that never expires', async () => {
        const token = await new SignJWT({
            sub: 'user-1',
        })
            .setProtectedHeader({
                alg: 'ES256',
                kid: KEY_ID,
            })
            .setIssuer(ISSUER)
            .setAudience(AUDIENCE)
            .sign(signingKey);

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses a token whose claims fail the schema', async () => {
        const token = await signToken({
            name: 'No subject',
        });

        expect((await callWith('/user', token)).status).toBe(401);
    });

    it('refuses a token that is not a JWT', async () => {
        expect((await callWith('/user', 'not-a-token')).status).toBe(401);
    });

    it('answers what context denies with', async () => {
        const token = await signToken({
            sub: 'user-1',
            email_verified: false,
        });

        const response = await callWith('/verifiedUser', token);

        expect(response.status).toBe(403);
        expect(response.body.detail).toBe('Verify your email first');
    });

    it('reads the token of an oauth2 identity', async () => {
        const response = await callWith(
            '/delegate',
            await signToken({
                sub: 'client-1',
            })
        );

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            caller: {
                clientId: 'client-1',
            },
        });
    });

    it('lets a token signed with the shared secret through', async () => {
        const token = await signToken(
            {
                sub: 'member-1',
            },
            {
                key: new TextEncoder().encode(SECRET),
                algorithm: 'HS256',
            }
        );

        const response = await callWith('/member', token);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            caller: {
                userId: 'member-1',
            },
        });
    });

    it('refuses a public-key token where a shared secret is expected', async () => {
        const token = await signToken({
            sub: 'member-1',
        });

        expect((await callWith('/member', token)).status).toBe(401);
    });

    it('fails with 500 rather than 401 when the keys cannot be fetched', async () => {
        jwksStatus = 503;
        const outage = buildApp();
        const response = await request(outage)
            .get('/user')
            .set(
                'authorization',
                `Bearer ${await signToken({
                    sub: 'user-1',
                })}`
            );

        expect(response.status).toBe(500);
    });
});

describe('verifyJwt before the environment is loaded', () => {
    const readUnset = (): string | undefined => undefined;

    it('defines the identity while kizuna generate runs without the environment', () => {
        const k = new Kizuna();
        const member = k.identity
            .bearer({
                context: z.object({
                    userId: z.string(),
                }),
            })
            .guard(
                verifyJwt({
                    secret: readUnset(),
                    issuer: readUnset(),
                    audience: AUDIENCE,
                    algorithms: ['HS256'],
                    claims: z.object({
                        sub: z.string(),
                    }),
                    context: ({ claims }) => ({
                        userId: claims.sub,
                    }),
                })
            );

        expect(() =>
            defineConfig({
                routes: [],
                auth: {
                    identities: {
                        member,
                    },
                },
            })
        ).not.toThrow();
    });

    it('throws on the first request when an option is still undefined', async () => {
        const guard = verifyJwt({
            secret: readUnset(),
            issuer: readUnset(),
            audience: AUDIENCE,
            algorithms: ['HS256'],
            claims: z.object({
                sub: z.string(),
            }),
            context: () => ({}),
        });

        await expect(
            guard({
                bearer: {
                    token: 'a.b.c',
                },
                deny: () => {
                    throw new Error('deny was called');
                },
            })
        ).rejects.toThrow('verifyJwt: `secret` and `issuer` are undefined. Set them before the API takes requests.');
    });

    it('still refuses the wrong algorithm at startup', () => {
        expect(() =>
            verifyJwt({
                secret: readUnset(),
                issuer: readUnset(),
                audience: AUDIENCE,
                algorithms: ['RS256'],
                claims: z.object({
                    sub: z.string(),
                }),
                context: () => ({}),
            } as never)
        ).toThrow(/"RS256" cannot verify with a secret/);
    });
});

describe('verifyJwt options', () => {
    const base = {
        issuer: ISSUER,
        audience: AUDIENCE,
        claims: z.object({
            sub: z.string(),
        }),
        context: () => ({}),
    };

    it('needs exactly one of jwks and secret', () => {
        expect(() =>
            verifyJwt({
                ...base,
                algorithms: ['ES256'],
            } as never)
        ).toThrow(/either `jwks` or `secret`/);
        expect(() =>
            verifyJwt({
                ...base,
                jwks: 'https://auth.example.com/jwks',
                secret: SECRET,
                algorithms: ['ES256'],
            } as never)
        ).toThrow(/either `jwks` or `secret`/);
    });

    it('needs at least one algorithm', () => {
        expect(() =>
            verifyJwt({
                ...base,
                jwks: 'https://auth.example.com/jwks',
                algorithms: [],
            })
        ).toThrow(/at least one algorithm/);
    });

    it('refuses a shared-secret algorithm with a JWKS', () => {
        expect(() =>
            verifyJwt({
                ...base,
                jwks: 'https://auth.example.com/jwks',
                algorithms: ['HS256'],
            } as never)
        ).toThrow(/"HS256" cannot verify against a JWKS/);
    });

    it('refuses none', () => {
        expect(() =>
            verifyJwt({
                ...base,
                jwks: 'https://auth.example.com/jwks',
                algorithms: ['none'],
            } as never)
        ).toThrow(/"none" cannot verify against a JWKS/);
        expect(() =>
            verifyJwt({
                ...base,
                secret: SECRET,
                algorithms: ['none'],
            } as never)
        ).toThrow(/"none" cannot verify with a secret/);
    });

    it('refuses a public-key algorithm with a secret', () => {
        expect(() =>
            verifyJwt({
                ...base,
                secret: SECRET,
                algorithms: ['RS256'],
            } as never)
        ).toThrow(/"RS256" cannot verify with a secret/);
    });

    it('refuses a secret shorter than its algorithm needs', () => {
        expect(() =>
            verifyJwt({
                ...base,
                secret: 'too-short',
                algorithms: ['HS256'],
            })
        ).toThrow(/HS256 needs a secret of at least 32 bytes/);
        expect(() =>
            verifyJwt({
                ...base,
                secret: SECRET,
                algorithms: ['HS512'],
            })
        ).toThrow(/HS512 needs a secret of at least 64 bytes/);
    });

    it('fetches keys over https, or http on localhost', () => {
        expect(() =>
            verifyJwt({
                ...base,
                jwks: 'http://auth.example.com/jwks',
                algorithms: ['ES256'],
            })
        ).toThrow(/must be https/);
        expect(() =>
            verifyJwt({
                ...base,
                jwks: 'http://localhost:3000/jwks',
                algorithms: ['ES256'],
            })
        ).not.toThrow();
    });

    it('needs an issuer and an audience', () => {
        expect(() =>
            verifyJwt({
                ...base,
                issuer: '',
                jwks: 'https://auth.example.com/jwks',
                algorithms: ['ES256'],
            })
        ).toThrow(/`issuer`/);
        expect(() =>
            verifyJwt({
                ...base,
                issuer: [ISSUER] as never,
                jwks: 'https://auth.example.com/jwks',
                algorithms: ['ES256'],
            })
        ).toThrow(/`issuer`/);
        expect(() =>
            verifyJwt({
                ...base,
                audience: [],
                jwks: 'https://auth.example.com/jwks',
                algorithms: ['ES256'],
            })
        ).toThrow(/`audience`/);
    });
});
