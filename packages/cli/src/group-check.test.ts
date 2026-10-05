import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, defineConfig, type Routes } from 'kizunajs';
import { checkGroups, formatGroupProblems } from './group-check.js';

interface Config {
    groups: typeof groups;
}

const k = new Kizuna<Config>();
const groups = k.groups({
    workspace: {
        title: 'Workspace',
        groups: {
            members: 'Members',
        },
    },
    health: 'Health',
});

const listMembers = k.route({
    method: 'GET',
    path: '/workspace/members',
    responses: {
        200: z.string(),
    },
});
const getHealth = k.route({
    method: 'GET',
    path: '/health',
    responses: {
        200: z.string(),
    },
});

const problemsOf = (routes: readonly Routes[]) =>
    checkGroups(
        defineConfig({
            groups,
            routes,
        }).api
    );

describe('checkGroups', () => {
    it('finds nothing when every route has a group and every group holds a route', () => {
        expect(
            problemsOf([
                k.routes.workspace.members({
                    listMembers,
                }),
                k.routes.health({
                    getHealth,
                }),
            ])
        ).toEqual([]);
    });

    it('reports a route in no group', () => {
        const problems = problemsOf([
            k.routes.workspace.members({
                listMembers,
            }),
            k.routes({
                getHealth,
            }),
        ]);
        expect(problems.map((problem) => problem.kind)).toEqual(['ungrouped', 'empty']);
        expect(problems[0]?.message).toBe('getHealth is in no group. Declare it with k.routes.<group>(...).');
    });

    it('reports a group with no route in it or below it', () => {
        const problems = problemsOf([
            k.routes.workspace.members({
                listMembers,
            }),
        ]);
        expect(problems).toEqual([
            {
                kind: 'empty',
                message: 'The group health holds no routes. Remove it, or file a route in it.',
            },
        ]);
    });

    it('counts a route listed under a group by its own groups', () => {
        const listedUnderHealth = k.route({
            method: 'GET',
            path: '/workspace/members',
            groups: ['health'],
            responses: {
                200: z.string(),
            },
        });
        expect(
            problemsOf([
                k.routes.workspace.members({
                    listedUnderHealth,
                }),
            ])
        ).toEqual([]);
    });

    it('leaves hidden routes out', () => {
        const ready = k.route({
            method: 'GET',
            path: '/ready',
            hidden: true,
            responses: {
                200: z.string(),
            },
        });
        expect(
            problemsOf([
                k.routes.workspace.members({
                    listMembers,
                }),
                k.routes.health({
                    getHealth,
                }),
                k.routes({
                    ready,
                }),
            ])
        ).toEqual([]);
    });

    it('checks nothing when the config declares no groups', () => {
        expect(
            checkGroups(
                defineConfig({
                    routes: [
                        k.routes({
                            getHealth,
                        }),
                    ],
                }).api
            )
        ).toEqual([]);
    });
});

describe('formatGroupProblems', () => {
    it('counts the problems above them', () => {
        expect(
            formatGroupProblems([
                {
                    kind: 'empty',
                    message: 'The group health holds no routes.',
                },
            ])
        ).toBe('1 group problem:\n  The group health holds no routes.');
    });
});
