import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { generateFetchClient } from './generator.js';
import { createGeneratedClient, type GeneratedRoutes } from './client.js';

const k = new Kizuna();

const UserSchema = Kizuna.model({
    title: 'User',
    description: 'A user in the system',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        nickname: z.string().optional(),
        appVersion: z.string().nullable(),
        description: z.string().nullable().optional(),
    }),
});

const routes = k.routes('users', {
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        query: z.object({
            page: z.int().optional(),
        }),
        responses: {
            200: z.array(UserSchema),
        },
    }),
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
            404: z.object({
                detail: z.string(),
            }),
        },
    }),
    uploadAvatar: k.route({
        method: 'POST',
        path: '/users/:id/avatar',
        contentType: 'multipart/form-data',
        body: z.object({
            file: z.file(),
        }),
        responses: {
            204: z.void(),
        },
    }),
    pingUser: k.route({
        method: 'POST',
        path: '/users/:id/ping',
        body: z.void(),
        responses: {
            204: z.void(),
        },
    }),
    watch: k.route({
        method: 'GET',
        path: '/users/:id/events',
        responses: {
            200: {
                stream: z.object({
                    kind: z.enum(['created', 'archived']),
                }),
            },
        },
    }),
});

const contract = defineConfig({
    routes: {
        users: routes,
    },
}).api;

const source = generateFetchClient(contract, { source: '../src/contract.ts' });

describe('generateFetchClient', () => {
    it('names a model once and references it by name', () => {
        expect(source).toContain('export type User = {');
        expect(source).toContain('A user in the system');
        expect(source.match(/export type User = \{/g)).toHaveLength(1);
        expect(source).toContain('body: Array<User>');
    });

    it('derives path params from the path when no schema declares them', () => {
        expect(source).toContain('export namespace UsersGetUser');
        expect(source).toContain('id: string;');
    });

    it('carries the method, path and content type into the table', () => {
        expect(source).toContain("method: 'POST'");
        expect(source).toContain("path: '/users/:id/avatar'");
        expect(source).toContain("contentType: 'multipart/form-data'");
    });

    it('tells the runtime which responses stream, and how', () => {
        expect(source).toContain("200: { stream: { contentType: 'text/event-stream' } }");
    });

    it('carries the method and whether the response streams into each method type', () => {
        expect(source).toContain("listUsers: ClientMethod<'GET', false, {");
        expect(source).toContain("getUser: ClientMethod<'GET', false, {");
    });

    it('types each response as a member of a discriminated union', () => {
        expect(source).toContain('{ status: 200; body: User; headers: Record<string, string> }');
        expect(source).toContain('{ status: 404; body: {');
    });

    it('names the contract it came from', () => {
        expect(source).toContain(' * Source: ../src/contract.ts');
        expect(source).toContain(' * Regenerate: kizuna generate');
    });

    it('keeps a nullable field required, since only the value may be null', () => {
        expect(source).toContain('appVersion: string | null;');
    });

    it('keeps the null on a field that is both nullable and optional', () => {
        expect(source).toContain('description?: string | null;');
    });

    it('asks for no body on a route that declares z.void()', () => {
        expect(source).toContain('export namespace UsersPingUser');
        expect(source).not.toContain('body: API.UsersPingUser.Body');
        expect(source).not.toContain('body: undefined,');
    });

    it('ships no schema library and no handlers', () => {
        expect(source).not.toContain('zod');
        expect(source).not.toContain('handler');
    });
});

describe('the namespace the generated types live in', () => {
    const named = generateFetchClient(contract, { namespace: 'MyAPI' });

    it('defaults to API', () => {
        expect(source).toContain('export namespace API {');
        expect(source).toContain('params: API.UsersGetUser.Params');
    });

    it('takes the name the config gives it', () => {
        expect(named).toContain('export namespace MyAPI {');
        expect(named).not.toContain('export namespace API {');
    });

    it('references every route type through that name', () => {
        expect(named).toContain('params: MyAPI.UsersGetUser.Params');
        expect(named).toContain('query?: MyAPI.UsersListUsers.Query');
        expect(named).toContain('body: MyAPI.UsersUploadAvatar.Body');
        expect(named).toContain('MyAPI.UsersGetUser.Result>');
        expect(named).not.toMatch(/\bAPI\.UsersGetUser/);
    });
});

describe('the generated table drives real requests', () => {
    const table: GeneratedRoutes = {
        users: {
            getUser: {
                method: 'GET',
                path: '/users/:id',
                responses: {
                    200: {},
                },
            },
        },
    };

    it('builds the URL from the path and params', async () => {
        const calls: string[] = [];
        const client = createGeneratedClient(table, {
            baseUrl: 'https://api.example.com',
            fetch: async (url) => {
                calls.push(String(url));
                return new Response(JSON.stringify({ id: '1' }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
            },
        }) as {
            users: {
                getUser: (args: { params: { id: string } }) => Promise<{ status: number; body: { id: string } }>;
            };
        };

        const result = await client.users.getUser({
            params: {
                id: '1',
            },
        });

        expect(calls).toEqual(['https://api.example.com/users/1']);
        expect(result.status).toBe(200);
        expect(result.body).toEqual({ id: '1' });
    });
});

describe('a model on something other than an object', () => {
    const Circle = Kizuna.model({
        title: 'Circle',
        schema: z.object({
            kind: z.literal('circle'),
            radius: z.number(),
        }),
    });

    const Square = Kizuna.model({
        title: 'Square',
        schema: z.object({
            kind: z.literal('square'),
            side: z.number(),
        }),
    });

    const Shape = Kizuna.model({
        title: 'Shape',
        schema: z.discriminatedUnion('kind', [Circle, Square]),
    });

    const Priority = Kizuna.model({
        title: 'Priority',
        schema: z.enum(['low', 'high']),
    });

    const shapeRoutes = k.routes('shapes', {
        getShape: k.route({
            method: 'GET',
            path: '/shapes/:id',
            responses: {
                200: Shape,
            },
        }),
        createShape: k.route({
            method: 'POST',
            path: '/shapes',
            body: Shape,
            query: z.object({
                priority: Priority,
            }),
            responses: {
                201: Shape,
            },
        }),
    });

    const output = generateFetchClient(
        defineConfig({
            routes: shapeRoutes,
        }).api
    );

    it('declares a discriminated union once and references it everywhere', () => {
        expect(output).toContain('export type Shape = Circle | Square;');
        expect(output).toContain('export type Body = Shape;');
        expect(output.match(/kind: "circle"/g)).toHaveLength(1);
    });

    it('declares an enum once and references it', () => {
        expect(output).toContain('export type Priority = "low" | "high";');
        expect(output).toContain('priority: Priority;');
    });
});

describe('a literal that is not a string', () => {
    const envelopeRoutes = k.routes('envelope', {
        read: k.route({
            method: 'GET',
            path: '/envelope',
            responses: {
                200: z.object({
                    success: z.literal(true),
                    version: z.literal(1),
                    kind: z.literal('full'),
                }),
            },
        }),
    });

    const output = generateFetchClient(
        defineConfig({
            routes: envelopeRoutes,
        }).api
    );

    it('types it as the JSON value rather than a string', () => {
        expect(output).toContain('success: true;');
        expect(output).toContain('version: 1;');
        expect(output).toContain('kind: "full";');
    });
});
