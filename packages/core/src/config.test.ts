import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { apiEntries, defineConfig } from './config.js';
import type { ClientTarget } from './config.js';

const k = new Kizuna();

const routes = k.routes('users', {
    getUser: {
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: z.object({
                name: z.string(),
            }),
        },
    },
});

const contract = k.contract({
    routes: {
        users: routes,
    },
});

describe('defineConfig', () => {
    it('hands the config back untouched', () => {
        const config = defineConfig({
            contract,
        });

        expect(config.contract).toBe(contract);
    });
});

describe('apiEntries', () => {
    it('reports a single API under `default`', () => {
        const config = defineConfig({
            contract,
        });

        expect(apiEntries(config)).toEqual([['default', config]]);
    });

    it('reports each named API', () => {
        const config = defineConfig({
            apis: {
                app: {
                    contract,
                },
                workspace: {
                    contract,
                },
            },
        });

        expect(apiEntries(config).map(([name]) => name)).toEqual(['app', 'workspace']);
    });

    it('carries each API clients through', () => {
        const swift: ClientTarget = {
            kind: 'swift',
            output: './API.swift',
            generate: () => '',
        };

        const config = defineConfig({
            apis: {
                app: {
                    contract,
                    clients: [swift],
                },
                workspace: {
                    contract,
                },
            },
        });

        expect(apiEntries(config)[0]?.[1].clients).toEqual([swift]);
    });
});
