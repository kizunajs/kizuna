import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import { flattenRoutes, isRouteDefinition } from './handler-pipeline.js';

const k = new Kizuna();

const UserSchema = z.object({
    id: z.string(),
    name: z.string(),
});

const getUser = k
    .route({
        method: 'GET',
        path: '/users/:id',
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

describe('k.route', () => {
    it('keeps the route it was given', () => {
        expect(getUser.method).toBe('GET');
        expect(getUser.path).toBe('/users/:id');
        expect(getUser.responses[200]).toBe(UserSchema);
    });

    it('carries the handler', () => {
        const handler = getUser.handler as (args: unknown) => unknown;

        expect(
            handler({
                params: {
                    id: '1',
                },
                query: undefined,
                body: undefined,
                headers: {},
                throwError: () => {
                    throw new Error('unused');
                },
            })
        ).toEqual({
            status: 200,
            body: {
                id: '1',
                name: 'Ada',
            },
        });
    });

    it('is a route to everything that walks the tree', () => {
        const routes = k.routes({
            users: {
                getUser,
            },
        });

        expect(isRouteDefinition(routes.users.getUser)).toBe(true);
        expect(flattenRoutes(routes).map((flattened) => flattened.routeKey)).toEqual(['users.getUser']);
    });

    it('reaches the contract with its handler', () => {
        const contract = k.contract({
            routes: k.routes({
                users: {
                    getUser,
                },
            }),
        });

        expect(contract.routes.users.getUser.handler).toBe(getUser.handler);
    });
});
