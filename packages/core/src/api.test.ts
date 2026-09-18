import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import type { Adapter, ApiWithRouter } from './adapter.js';
import { ROUTER_META } from './adapter.js';

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

/**
 * Records what it was handed, so a test can read the api a framework would
 * receive without pulling in a framework.
 */
const mounted: { api?: ApiWithRouter; args: unknown[] } = {
    args: [],
};

const probeAdapter: Adapter<{ native: string }, [label: string], string> = {
    name: 'probe',
    mount: (api, label) => {
        mounted.api = api;
        mounted.args = [label];
        return label;
    },
};

const user = Kizuna.identity.bearer({
    context: z.object({
        userId: z.string(),
    }),
});

const k = new Kizuna({
    adapter: probeAdapter,
    identities: {
        user,
    },
});

const getUser = k
    .route({
        method: 'GET',
        path: '/users/:id',
        auth: 'user',
        responses: {
            200: UserSchema,
        },
    })
    .handler(({ params }) => ({
        status: 200,
        body: {
            id: params.id,
            name: 'Ada',
        },
    }));

const contract = k.contract({
    routes: k.routes({
        users: {
            getUser,
        },
    }),
});

const requireUser = () => ({
    userId: '1',
});

describe('k.api', () => {
    it('takes its handlers from the routes', () => {
        const api = k.api({
            contract,
            guards: {
                user: requireUser,
            },
        });

        const router = (api as unknown as Record<symbol, Record<string, Record<string, unknown>>>)[ROUTER_META]!;

        expect(router.users!.getUser).toBe(getUser.handler);
    });

    it('carries the contract it was built from', () => {
        const api = k.api({
            contract,
            guards: {
                user: requireUser,
            },
        });

        expect(api.routes).toBe(contract.routes);
        expect(api.securitySchemes).toBe(contract.securitySchemes);
    });

    it('mounts through the adapter on the instance', () => {
        const api = k.api({
            contract,
            guards: {
                user: requireUser,
            },
        });

        expect(api.mount('an-app')).toBe('an-app');
        expect(mounted.api).toBe(api);
    });

    it('takes an adapter of its own when the instance declares none', () => {
        const plain = new Kizuna();
        const plainContract = plain.contract({
            routes: plain.routes({
                health: {
                    live: plain
                        .route({
                            method: 'GET',
                            path: '/health',
                            responses: {
                                200: z.object({
                                    ok: z.boolean(),
                                }),
                            },
                        })
                        .handler(() => ({
                            status: 200,
                            body: {
                                ok: true,
                            },
                        })),
                },
            }),
        });

        const api = plain.api({
            contract: plainContract,
            adapter: probeAdapter,
        });

        expect(api.mount('other-app')).toBe('other-app');
    });

    it('refuses to mount with no adapter anywhere', () => {
        const plain = new Kizuna();
        const plainContract = plain.contract({
            routes: plain.routes({
                health: {
                    live: {
                        method: 'GET',
                        path: '/health',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    },
                },
            }),
        });

        // @ts-expect-error an instance with no adapter needs one here
        const api = plain.api({
            contract: plainContract,
        });

        expect(() => (api as { mount: (...args: unknown[]) => unknown }).mount('app')).toThrow(/no adapter to mount on/);
    });
});
