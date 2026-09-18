import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import type { Adapter, ApiWithRouter } from './adapter.js';
import { ROUTER_META } from './adapter.js';
import { HANDLER } from './types.js';

interface Config {
    adapter: typeof probeAdapter;
    identities: {
        user: typeof user;
    };
}

const k = new Kizuna<Config>();

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

const user = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(() => ({
        userId: '1',
    }));

const config = {
    adapter: probeAdapter,
    identities: {
        user,
    },
};

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

const contract = defineConfig({
    ...config,
    routes: k.routes({
        users: {
            getUser,
        },
    }),
}).api;

describe('defineConfig', () => {
    it('takes its handlers from the routes', () => {
        const router = (contract as unknown as Record<symbol, Record<string, Record<string, unknown>>>)[ROUTER_META]!;

        expect(router.users!.getUser).toBe(getUser[HANDLER]);
    });

    it('mounts through the adapter the config names', () => {
        expect(contract.mount('an-app')).toBe('an-app');
        expect(mounted.api).toBe(contract);
    });

    it('mounts on whatever adapter the config names', () => {
        const plain = new Kizuna();
        const { api } = defineConfig({
            adapter: probeAdapter,
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

        expect(api.mount('other-app')).toBe('other-app');
    });

    it('refuses to mount when the config names no adapter', () => {
        const plain2 = new Kizuna();
        const { api } = defineConfig({
            routes: plain2.routes({
                health: {
                    live: plain2.route({
                        method: 'GET',
                        path: '/health',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                        },
                    }),
                },
            }),
        });

        expect(() => (api as unknown as { mount: (...args: unknown[]) => unknown }).mount('app')).toThrow(/no adapter to mount on/);
    });
});
