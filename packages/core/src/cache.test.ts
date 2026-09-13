import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { BinarySchema } from './schemas.js';
import { cacheHeaders } from './cache.js';
import type { CachePolicy } from './types.js';

describe('cacheHeaders', () => {
    test('a response with no cache policy sends nothing', () => {
        expect(cacheHeaders(undefined)).toEqual({});
    });

    test("'no-store' sends the directive alone", () => {
        expect(cacheHeaders('no-store')).toEqual({
            'cache-control': 'no-store',
        });
    });

    test('a scope and a max age read the way they are written', () => {
        expect(
            cacheHeaders({
                scope: 'private',
                maxAge: 300,
            })
        ).toEqual({
            'cache-control': 'private, max-age=300',
        });
    });

    test('vary is its own header', () => {
        expect(
            cacheHeaders({
                scope: 'private',
                maxAge: 60,
                vary: ['authorization', 'accept-language'],
            })
        ).toEqual({
            'cache-control': 'private, max-age=60',
            vary: 'authorization, accept-language',
        });
    });

    test('vary alone sends no cache-control', () => {
        expect(
            cacheHeaders({
                vary: ['authorization'],
            })
        ).toEqual({
            vary: 'authorization',
        });
    });

    test('every directive, in a fixed order', () => {
        expect(
            cacheHeaders({
                immutable: true,
                mustRevalidate: true,
                staleIfError: 86400,
                staleWhileRevalidate: 30,
                sharedMaxAge: 600,
                maxAge: 300,
                noCache: true,
                scope: 'public',
            })
        ).toEqual({
            'cache-control':
                'public, no-cache, max-age=300, s-maxage=600, stale-while-revalidate=30, stale-if-error=86400, must-revalidate, immutable',
        });
    });

    test('a max age of zero is sent, not dropped', () => {
        expect(
            cacheHeaders({
                maxAge: 0,
                mustRevalidate: true,
            })
        ).toEqual({
            'cache-control': 'max-age=0, must-revalidate',
        });
    });
});

const k = new Kizuna();

const contractWith = (cache: CachePolicy) =>
    k.contract({
        routes: k.routes('users', {
            listUsers: {
                method: 'GET',
                path: '/users',
                responses: {
                    200: {
                        body: z.object({
                            ok: z.boolean(),
                        }),
                        cache,
                    },
                },
            },
        }),
    });

describe('assertValidCache', () => {
    test('an empty policy is rejected', () => {
        expect(() => contractWith({})).toThrow(/declares an empty cache policy on its 200 response/);
    });

    test('a fractional number of seconds is rejected', () => {
        expect(() =>
            contractWith({
                maxAge: 1.5,
            })
        ).toThrow(/max-age is a whole number of seconds/);
    });

    test('a negative number of seconds is rejected', () => {
        expect(() =>
            contractWith({
                staleIfError: -1,
            })
        ).toThrow(/cache\.staleIfError as -1 on its 200 response/);
    });

    test('an empty vary is rejected', () => {
        expect(() =>
            contractWith({
                maxAge: 60,
                vary: [],
            })
        ).toThrow(/declares an empty cache\.vary on its 200 response/);
    });

    test('a valid policy passes', () => {
        expect(() =>
            contractWith({
                scope: 'private',
                maxAge: 300,
                vary: ['authorization'],
            })
        ).not.toThrow();
    });

    test('a public scope on a public route passes', () => {
        expect(() =>
            contractWith({
                scope: 'public',
                maxAge: 300,
            })
        ).not.toThrow();
    });

    test('noCache alongside a freshness lifetime is rejected', () => {
        expect(() =>
            contractWith({
                noCache: true,
                maxAge: 300,
            })
        ).toThrow(/cache\.noCache alongside a freshness lifetime/);
    });

    test('noCache alone passes', () => {
        expect(() =>
            contractWith({
                scope: 'private',
                noCache: true,
            })
        ).not.toThrow();
    });

    test('immutable with no freshness lifetime is rejected', () => {
        expect(() =>
            contractWith({
                immutable: true,
            })
        ).toThrow(/cache\.immutable with no cache\.maxAge/);
    });

    test('immutable alongside a long max age passes', () => {
        expect(() =>
            contractWith({
                scope: 'public',
                maxAge: 31536000,
                immutable: true,
            })
        ).not.toThrow();
    });

    test('staleWhileRevalidate with no freshness lifetime is rejected', () => {
        expect(() =>
            contractWith({
                staleWhileRevalidate: 30,
            })
        ).toThrow(/cache\.staleWhileRevalidate with no cache\.maxAge/);
    });

    test('staleIfError with no freshness lifetime is rejected', () => {
        expect(() =>
            contractWith({
                staleIfError: 86400,
            })
        ).toThrow(/cache\.staleIfError with no cache\.maxAge/);
    });

    test('noCache with staleWhileRevalidate is rejected, since no-cache leaves nothing to go stale', () => {
        expect(() =>
            contractWith({
                noCache: true,
                staleWhileRevalidate: 60,
            })
        ).toThrow(/cache\.staleWhileRevalidate with no cache\.maxAge/);
    });

    test('a shared max age counts as the freshness lifetime', () => {
        expect(() =>
            contractWith({
                scope: 'public',
                sharedMaxAge: 600,
                staleWhileRevalidate: 30,
            })
        ).not.toThrow();
    });

    test('a policy on an error response is checked too, and names that status', () => {
        expect(() =>
            k.contract({
                routes: k.routes('users', {
                    getUser: {
                        method: 'GET',
                        path: '/users/:id',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                            404: {
                                body: z.object({
                                    detail: z.string(),
                                }),
                                cache: {
                                    maxAge: -10,
                                },
                            },
                        },
                    },
                }),
            })
        ).toThrow(/cache\.maxAge as -10 on its 404 response/);
    });

    test('a public scope on a route behind authentication is rejected', () => {
        const user = Kizuna.identity.bearer({});
        const secured = new Kizuna({
            identities: {
                user,
            },
        });
        const routes = secured.routes('users', {
            listUsers: {
                method: 'GET',
                path: '/users',
                responses: {
                    200: {
                        body: z.object({
                            ok: z.boolean(),
                        }),
                        cache: {
                            scope: 'public',
                            maxAge: 300,
                        },
                    },
                },
            },
        });
        expect(() =>
            secured.contract({
                routes: {
                    users: routes,
                },
                accessControl: {
                    users: 'user',
                },
            })
        ).toThrow(/declares cache\.scope 'public' on its 200 response, but the route is behind authentication/);
    });
});

describe('the policies the caching guide shows', () => {
    test('are all accepted by k.contract', () => {
        expect(() =>
            k.contract({
                routes: k.routes('docs', {
                    badge: {
                        method: 'GET',
                        path: '/users/:id/badge/:version',
                        responses: {
                            200: {
                                body: BinarySchema,
                                contentType: 'image/png',
                                cache: {
                                    scope: 'public',
                                    maxAge: 31536000,
                                    immutable: true,
                                },
                            },
                        },
                    },
                    badgeFallback: {
                        method: 'GET',
                        path: '/users/:id/badge',
                        responses: {
                            200: {
                                body: BinarySchema,
                                contentType: 'image/png',
                                cache: {
                                    scope: 'public',
                                    noCache: true,
                                },
                                etag: true,
                            },
                        },
                    },
                    catalogue: {
                        method: 'GET',
                        path: '/catalogue',
                        responses: {
                            200: {
                                body: z.array(z.string()),
                                cache: {
                                    scope: 'public',
                                    maxAge: 0,
                                    sharedMaxAge: 600,
                                    staleWhileRevalidate: 60,
                                },
                            },
                        },
                    },
                    invoices: {
                        method: 'GET',
                        path: '/invoices',
                        responses: {
                            200: {
                                body: z.array(z.string()),
                                cache: {
                                    scope: 'private',
                                    noCache: true,
                                    vary: ['authorization'],
                                },
                                etag: true,
                            },
                        },
                    },
                    fingerprinted: {
                        method: 'GET',
                        path: '/assets/:hash',
                        responses: {
                            200: {
                                body: BinarySchema,
                                contentType: 'image/png',
                                cache: {
                                    scope: 'public',
                                    maxAge: 31536000,
                                    immutable: true,
                                },
                            },
                        },
                    },
                }),
            })
        ).not.toThrow();
    });
});
