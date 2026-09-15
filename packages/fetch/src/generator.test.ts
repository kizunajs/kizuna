import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
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
    }),
});

const routes = k.routes('users', {
    listUsers: {
        method: 'GET',
        path: '/users',
        query: z.object({
            page: z.int().optional(),
        }),
        responses: {
            200: z.array(UserSchema),
        },
    },
    getUser: {
        method: 'GET',
        path: '/users/:id',
        responses: {
            200: UserSchema,
            404: z.object({
                detail: z.string(),
            }),
        },
    },
    uploadAvatar: {
        method: 'POST',
        path: '/users/:id/avatar',
        contentType: 'multipart/form-data',
        body: z.object({
            file: z.file(),
        }),
        responses: {
            204: z.void(),
        },
    },
    watch: {
        method: 'GET',
        path: '/users/:id/events',
        responses: {
            200: {
                stream: z.object({
                    kind: z.enum(['created', 'archived']),
                }),
            },
        },
    },
});

const contract = k.contract({
    routes: {
        users: routes,
    },
});

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

    it('requires args only when the route does', () => {
        expect(source).toContain('listUsers(args?: {');
        expect(source).toContain('getUser(args: {');
    });

    it('types each response as a member of a discriminated union', () => {
        expect(source).toContain('{ status: 200; body: User; headers: Record<string, string> }');
        expect(source).toContain('{ status: 404; body: {');
    });

    it('names the contract it came from', () => {
        expect(source).toContain(' * Source: ../src/contract.ts');
        expect(source).toContain(' * Regenerate: kizuna generate');
    });

    it('ships no schema library and no handlers', () => {
        expect(source).not.toContain('zod');
        expect(source).not.toContain('handler');
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
