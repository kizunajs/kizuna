import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { apiEntries } from './config.js';
import { defineConfig } from './define-config.js';
import type { GeneratedFile } from './config.js';

const k = new Kizuna();

const routes = k.routes({
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

const swiftClient: GeneratedFile = {
    target: 'swift',
    output: './APIClient.swift',
    render: () => '',
};

describe('defineConfig', () => {
    it('hands back the api it assembled', () => {
        const { api } = defineConfig({
            routes: [{ users: routes }],
        });

        expect(Object.keys(api.routes)).toEqual(['users']);
    });

    it('carries the clients it was given', () => {
        const { clients } = defineConfig({
            routes: [{ users: routes }],
            clients: [swiftClient],
        });

        expect(clients).toEqual([swiftClient]);
    });

    it('has no clients when none are declared', () => {
        const { clients } = defineConfig({
            routes: [{ users: routes }],
        });

        expect(clients).toEqual([]);
    });
});

describe('typescript.extend', () => {
    it('carries what typescript.extend adds to the Config', () => {
        const { typescript } = defineConfig({
            routes: [{ users: routes }],
            typescript: {
                extend: [
                    {
                        reports: {
                            names: ['daily', 'weekly'],
                        },
                    },
                ],
            },
        });

        expect(typescript?.extend).toEqual([
            {
                reports: {
                    names: ['daily', 'weekly'],
                },
            },
        ]);
    });

    it('refuses a name Kizuna.js already writes into Config', () => {
        expect(() =>
            defineConfig({
                routes: [{ users: routes }],
                typescript: {
                    extend: [
                        {
                            plugins: {
                                names: ['daily'],
                            },
                        },
                    ],
                },
            })
        ).toThrow("`typescript.extend` names 'plugins', which Kizuna.js already writes into `Config`. Pick another name.");
    });

    it('refuses one name added twice', () => {
        expect(() =>
            defineConfig({
                routes: [{ users: routes }],
                typescript: {
                    extend: [
                        {
                            reports: {
                                names: ['daily'],
                            },
                        },
                        {
                            reports: {
                                names: ['weekly'],
                            },
                        },
                    ],
                },
            })
        ).toThrow("`typescript.extend` names 'reports' twice.");
    });

    it('refuses a value the types file cannot write', () => {
        expect(() =>
            defineConfig({
                routes: [{ users: routes }],
                typescript: {
                    extend: [
                        {
                            reports: {
                                every: [7] as never,
                            },
                        },
                    ],
                },
            })
        ).toThrow("`typescript.extend` gives 'reports.every' something other than a list of strings or an object of them.");
    });
});

describe('apiEntries', () => {
    it('reads the config a module default-exports', () => {
        const config = defineConfig({
            routes: [{ users: routes }],
        });

        expect(apiEntries({ default: config }).map(([name]) => name)).toEqual(['default']);
    });

    it('carries the clients the config declares', () => {
        const config = defineConfig({
            routes: [{ users: routes }],
            clients: [swiftClient],
        });

        expect(apiEntries({ default: config })[0]?.[1].clients).toEqual([swiftClient]);
    });

    it('reports nothing for a module with no config', () => {
        expect(apiEntries({ notAConfig: 1 })).toEqual([]);
    });
});
