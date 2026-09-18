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
    it('reports an api exported as `api` under `default`', () => {
        const { api } = defineConfig({
            routes: {
                users: routes,
            },
        });

        expect(apiEntries({ api }).map(([name]) => name)).toEqual(['default']);
    });

    it('reports each api a module exports under its own name', () => {
        const app = defineConfig({
            routes: {
                users: routes,
            },
        }).api;
        const workspace = defineConfig({
            routes: {
                users: routes,
            },
        }).api;

        expect(apiEntries({ app, workspace }).map(([name]) => name)).toEqual(['app', 'workspace']);
    });

    it('carries the clients a module exports alongside its api', () => {
        const { api } = defineConfig({
            routes: {
                users: routes,
            },
        });

        expect(apiEntries({ api, clients: [swiftClient] })[0]?.[1].clients).toEqual([swiftClient]);
    });
});
