import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { apiEntries } from './config.js';
import { defineConfig } from './define-config.js';
import type { ClientTarget } from './config.js';

const k = new Kizuna();

const routes = k.routes('users', {
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: z.object({
                name: z.string(),
            }),
        },
    }),
});

const swiftClient: ClientTarget = {
    kind: 'swift',
    output: './APIClient.swift',
    generate: () => '',
};

describe('defineConfig', () => {
    it('hands back the api it assembled', () => {
        const { api } = defineConfig({
            routes: {
                users: routes,
            },
        });

        expect(Object.keys(api.routes)).toEqual(['users']);
    });

    it('carries the clients it was given', () => {
        const { clients } = defineConfig({
            routes: {
                users: routes,
            },
            clients: [swiftClient],
        });

        expect(clients).toEqual([swiftClient]);
    });

    it('has no clients when none are declared', () => {
        const { clients } = defineConfig({
            routes: {
                users: routes,
            },
        });

        expect(clients).toEqual([]);
    });
});

describe('apiEntries', () => {
    it('reads the config a module default-exports', () => {
        const config = defineConfig({
            routes: {
                users: routes,
            },
        });

        expect(apiEntries({ default: config }).map(([name]) => name)).toEqual(['default']);
    });

    it('carries the clients the config declares', () => {
        const config = defineConfig({
            routes: {
                users: routes,
            },
            clients: [swiftClient],
        });

        expect(apiEntries({ default: config })[0]?.[1].clients).toEqual([swiftClient]);
    });

    it('reports nothing for a module with no config', () => {
        expect(apiEntries({ notAConfig: 1 })).toEqual([]);
    });
});
