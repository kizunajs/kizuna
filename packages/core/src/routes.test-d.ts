import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { groupRoutes } from './routes.js';
import { Kizuna } from './kizuna.js';

const k = new Kizuna();

const routes = groupRoutes({
    getUser: {
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: z.object({
                id: z.string(),
                name: z.string(),
            }),
            404: z.object({
                message: z.string(),
            }),
        },
    },
    createUser: {
        method: 'POST',
        path: '/users',
        body: z.object({
            name: z.string(),
        }),
        responses: {
            201: z.object({
                id: z.string(),
            }),
        },
    },
});

test('routes preserves literal method and path strings', () => {
    expectTypeOf(routes.getUser.method).toEqualTypeOf<'GET'>();
    expectTypeOf(routes.getUser.path).toEqualTypeOf<'/users/:id'>();
    expectTypeOf(routes.createUser.method).toEqualTypeOf<'POST'>();
    expectTypeOf(routes.createUser.path).toEqualTypeOf<'/users'>();
});

test('createUser has body, getUser does not', () => {
    expectTypeOf(routes.createUser.body).not.toBeUndefined();
    expectTypeOf(routes.getUser).not.toHaveProperty('body');
});

test('path must start with /', () => {
    // @ts-expect-error path must start with /
    groupRoutes({ bad: { method: 'GET', path: 'users/:id', responses: { 200: z.string() } } });
});

const groups = k.groups({
    users: {
        title: 'Users',
        description: 'User management endpoints',
    },
    workspaces: {
        title: 'Workspaces',
        groups: {
            members: 'Members',
        },
    },
    health: {
        title: 'Health',
    },
});
const grouped = new Kizuna<{
    groups: typeof groups;
}>();

const usersRoutes = grouped.routes.users({
    getUser: {
        method: 'GET',
        path: '/users/:id',
        groups: ['health'],
        responses: {
            200: z.object({
                id: z.string(),
            }),
        },
    },
});

test('grouped routes preserve literal types', () => {
    expectTypeOf(usersRoutes.getUser.method).toEqualTypeOf<'GET'>();
    expectTypeOf(usersRoutes.getUser.path).toEqualTypeOf<'/users/:id'>();
});

test('k.routes reaches a nested group by its path', () => {
    const memberRoutes = grouped.routes.workspaces.members({
        listMembers: {
            method: 'GET',
            path: '/workspaces/:workspaceId/members',
            responses: {
                200: z.string(),
            },
        },
    });
    expectTypeOf(memberRoutes.listMembers.path).toEqualTypeOf<'/workspaces/:workspaceId/members'>();
});

test('a group must be declared', () => {
    // @ts-expect-error 'unknown' is not a declared group
    grouped.routes.unknown({
        getUser: {
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('a nested group is reached through its parent, never at the root', () => {
    // @ts-expect-error 'members' sits under 'workspaces'
    void grouped.routes.members;
});

test('a k without groups offers none', () => {
    // @ts-expect-error no groups are declared
    void k.routes.users;
});

test('route-level groups must be declared group paths', () => {
    grouped.routes.users({
        getUser: {
            method: 'GET',
            path: '/users/:id',
            // @ts-expect-error 'unknown' is not a declared group
            groups: ['unknown'],
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('route-level groups take nested paths', () => {
    grouped.routes.users({
        getUser: {
            method: 'GET',
            path: '/users/:id',
            groups: ['workspaces.members'],
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('groupRoutes on its own accepts any group path', () => {
    groupRoutes({
        getUser: {
            method: 'GET',
            path: '/users/:id',
            groups: ['anything'],
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('pathParams keys must match the path placeholders', () => {
    groupRoutes({
        getPlace: {
            method: 'GET',
            path: '/places/:plackeId',
            // @ts-expect-error 'placeId' is not a parameter in '/places/:plackeId'
            pathParams: z.object({
                placeId: z.uuid(),
            }),
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('every path placeholder must appear in pathParams', () => {
    groupRoutes({
        getVisit: {
            method: 'GET',
            path: '/places/:placeId/visits/:visitId',
            // @ts-expect-error 'visitId' is missing from pathParams
            pathParams: z.object({
                placeId: z.uuid(),
            }),
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('matching pathParams are accepted, in nested groups too', () => {
    const checked = groupRoutes({
        getPlace: {
            method: 'GET',
            path: '/places/:placeId',
            pathParams: z.object({
                placeId: z.uuid(),
            }),
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
        visits: {
            getVisit: {
                method: 'GET',
                path: '/places/:placeId/visits/:visitId',
                pathParams: z.object({
                    placeId: z.uuid(),
                    visitId: z.uuid(),
                }),
                responses: {
                    200: z.object({
                        id: z.string(),
                    }),
                },
            },
        },
    });
    expectTypeOf(checked.getPlace.path).toEqualTypeOf<'/places/:placeId'>();
    expectTypeOf(checked.visits.getVisit.path).toEqualTypeOf<'/places/:placeId/visits/:visitId'>();
});

test('routes that omit pathParams are left alone', () => {
    groupRoutes({
        getPlace: {
            method: 'GET',
            path: '/places/:placeId',
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});

test('a pathParams schema without a known key set switches the check off', () => {
    groupRoutes({
        getPlace: {
            method: 'GET',
            path: '/places/:placeId',
            pathParams: z.record(z.string(), z.string()),
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        },
    });
});
