import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { defineConfig } from './define-config.js';
import { createGroups } from './groups.js';
import { flattenRoutes } from './handler-pipeline.js';

const groups = createGroups({
    workspaces: {
        title: 'Workspaces',
        description: 'Shared spaces',
        groups: {
            members: 'Members',
            invites: {
                title: 'Invites',
            },
        },
    },
    health: 'Health',
});

const k = new Kizuna<{
    groups: typeof groups;
}>();

const listMembers = k.route({
    method: 'GET',
    path: '/workspaces/:workspaceId/members',
    responses: {
        200: z.string(),
    },
});

describe('k.groups', () => {
    it('resolves every group by its dotted path, each ahead of the groups under it', () => {
        expect([...groups.groups.keys()]).toEqual(['workspaces', 'workspaces.members', 'workspaces.invites', 'health']);
    });

    it('reads a string as the title', () => {
        expect(groups.groups.get('workspaces.members')?.title).toBe('Members');
    });

    it('records the lineage from the outermost group down', () => {
        expect(groups.groups.get('workspaces.invites')?.lineage).toEqual(['workspaces', 'workspaces.invites']);
        expect(groups.groups.get('health')?.lineage).toEqual(['health']);
    });

    it('keeps the description', () => {
        expect(groups.groups.get('workspaces')?.description).toBe('Shared spaces');
    });

    it('throws when two siblings share a title', () => {
        expect(() =>
            createGroups({
                workspaces: {
                    title: 'Workspaces',
                    groups: {
                        members: 'Members',
                        people: 'Members',
                    },
                },
            })
        ).toThrow('The groups "workspaces.members" and "workspaces.people" share the title "Members"');
    });

    it('lets groups under different parents share a title', () => {
        expect(() =>
            createGroups({
                workspace: {
                    title: 'Workspace',
                    groups: {
                        notes: 'Notes',
                    },
                },
                assistant: {
                    title: 'Assistant',
                    groups: {
                        notes: 'Notes',
                    },
                },
            })
        ).not.toThrow();
    });

    it('throws on a key with a dot in it', () => {
        expect(() =>
            createGroups({
                'workspaces.members': 'Members',
            })
        ).toThrow('has a dot in its key');
    });
});

describe('flattenRoutes', () => {
    it('files each route under its group, then its own groups', () => {
        const routes = k.routes.workspaces.members({
            listMembers: k.route({
                method: 'GET',
                path: '/workspaces/:workspaceId/members',
                groups: ['health', 'workspaces.members'],
                responses: {
                    200: z.string(),
                },
            }),
        });
        expect(flattenRoutes(routes)[0]?.routeGroups).toEqual(['workspaces.members', 'health']);
    });

    it('files a tree in no group, nested in a group call, under that group', () => {
        const routes = k.routes.workspaces({
            members: k.routes({
                listMembers,
            }),
        });
        expect(flattenRoutes(routes)[0]?.routeGroups).toEqual(['workspaces']);
    });

    it('throws on a tree declared into a group, nested in another call', () => {
        expect(() =>
            k.routes.workspaces({
                members: k.routes.workspaces.members({
                    listMembers,
                }),
            })
        ).toThrow('"members" was declared into the group workspaces.members, so its key comes from there.');
    });

    it('files a route in no group under none', () => {
        const routes = k.routes({
            listMembers,
        });
        expect(flattenRoutes(routes)[0]?.routeGroups).toEqual([]);
    });
});

describe('defineConfig', () => {
    it('throws on a route filed under a group it does not declare', () => {
        const otherGroups = createGroups({
            billing: 'Billing',
        });
        const other = new Kizuna<{
            groups: typeof otherGroups;
        }>();
        expect(() =>
            defineConfig({
                groups,
                routes: [
                    other.routes.billing({
                        listMembers,
                    }),
                ],
            })
        ).toThrow("Route 'billing.listMembers' is filed under the group 'billing', which `groups` does not declare.");
    });

    it('throws on a grouped route when the config declares no groups', () => {
        expect(() =>
            defineConfig({
                routes: [
                    k.routes.health({
                        listMembers,
                    }),
                ],
            })
        ).toThrow('the config declares no groups');
    });

    it('accepts routes filed under declared groups', () => {
        expect(() =>
            defineConfig({
                groups,
                routes: [
                    k.routes.workspaces.members({
                        listMembers,
                    }),
                ],
            })
        ).not.toThrow();
    });
});

describe("defineConfig's routes list", () => {
    const getHealth = k.route({
        method: 'GET',
        path: '/health',
        responses: {
            200: z.string(),
        },
    });

    it('keys each route by its group, in any order', () => {
        const { api } = defineConfig({
            groups,
            routes: [
                k.routes.health({
                    getHealth,
                }),
                k.routes.workspaces.members({
                    listMembers,
                }),
            ],
        });
        expect(flattenRoutes(api.routes).map((entry) => entry.routeKey)).toEqual(['health.getHealth', 'workspaces.members.listMembers']);
    });

    it('keys an object inside a group call one level deeper', () => {
        const { api } = defineConfig({
            groups,
            routes: [
                k.routes.workspaces.members({
                    admin: {
                        listMembers,
                    },
                }),
            ],
        });
        expect(flattenRoutes(api.routes).map((entry) => entry.routeKey)).toEqual(['workspaces.members.admin.listMembers']);
        expect(flattenRoutes(api.routes)[0]?.routeGroups).toEqual(['workspaces.members']);
    });

    it('merges two files declared into the same group', () => {
        const { api } = defineConfig({
            groups,
            routes: [
                k.routes.health({
                    getHealth,
                }),
                k.routes.health({
                    listMembers,
                }),
            ],
        });
        expect(flattenRoutes(api.routes).map((entry) => entry.routeKey)).toEqual(['health.getHealth', 'health.listMembers']);
    });

    it('throws when two routes claim the same key', () => {
        expect(() =>
            defineConfig({
                groups,
                routes: [
                    k.routes.health({
                        getHealth,
                    }),
                    k.routes.health({
                        getHealth: k.route({
                            method: 'GET',
                            path: '/health/again',
                            responses: {
                                200: z.string(),
                            },
                        }),
                    }),
                ],
            })
        ).toThrow('Two routes claim the key "health.getHealth".');
    });

    it('reads a plain object as routes in no group', () => {
        const { api } = defineConfig({
            routes: [
                {
                    status: {
                        getHealth,
                    },
                },
            ],
        });
        expect(flattenRoutes(api.routes).map((entry) => entry.routeKey)).toEqual(['status.getHealth']);
    });
});
