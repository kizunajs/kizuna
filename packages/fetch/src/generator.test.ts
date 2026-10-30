import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { definePlugin, route } from 'kizunajs/plugin';
import { generateFetchClient } from './generator.js';
import { fetchClient, fetchIds } from './client-target.js';
import { apiContract } from './api.fixture.js';

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

const routes = k.routes({
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
    routes: [{ users: routes }],
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

    it('lists the validation 400 in the table, as the types do', () => {
        expect(source).toMatch(/listUsers: \{\n\s+method: 'GET',\n\s+path: '\/users',\n\s+responses: \{\n\s+200: \{\},\n\s+400: \{\},/);
    });

    it('imports nothing', () => {
        expect(source).not.toMatch(/^import /m);
    });

    it('tells the runtime which responses stream, and how', () => {
        expect(source).toContain("200: { stream: true, contentType: 'text/event-stream' }");
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

    const shapeRoutes = k.routes({
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
            routes: [shapeRoutes],
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

describe('a described model field', () => {
    const ArticleStatus = Kizuna.model({
        title: 'ArticleStatus',
        schema: z.enum(['draft', 'published']),
    });

    const Author = Kizuna.model({
        title: 'Author',
        description: 'The person who wrote an article',
        schema: z.object({
            name: z.string(),
        }),
    });

    const articleRoutes = k.routes({
        getArticle: k.route({
            method: 'GET',
            path: '/articles/:id',
            responses: {
                200: z.object({
                    status: ArticleStatus.describe('Set by the editor'),
                    writer: Author.describe('Shown in the byline'),
                }),
            },
        }),
    });

    const output = generateFetchClient(
        defineConfig({
            routes: [articleRoutes],
        }).api
    );

    it('types the field as the model', () => {
        expect(output).toContain('status: ArticleStatus;');
        expect(output).toContain('export type ArticleStatus = "draft" | "published";');
    });

    it('declares a model reached only through the copy with its own description', () => {
        expect(output).toContain('writer: Author;');
        expect(output).toMatch(/\* The person who wrote an article\n\s*\*\/\n\s*export type Author = \{/);
    });
});

describe('a literal that is not a string', () => {
    const envelopeRoutes = k.routes({
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
            routes: [envelopeRoutes],
        }).api
    );

    it('types it as the JSON value rather than a string', () => {
        expect(output).toContain('success: true;');
        expect(output).toContain('version: 1;');
        expect(output).toContain('kind: "full";');
    });
});

const hiddenFixturePlugin = definePlugin({
    slug: 'status',
    setup: () => ({
        routes: {
            ping: route({
                method: 'GET',
                path: '/status/ping',
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }).handler(() => ({
                status: 200,
                body: {
                    ok: true,
                },
            })),
            internalProbe: route({
                method: 'GET',
                path: '/status/internal-probe',
                hidden: true,
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }).handler(() => ({
                status: 200,
                body: {
                    ok: true,
                },
            })),
        },
    }),
});

const hiddenFixtureContract = () =>
    defineConfig({
        routes: [
            {
                listUsers: {
                    method: 'GET',
                    path: '/users',
                    responses: {
                        200: z.array(z.string()),
                    },
                },
                healthCheck: {
                    method: 'GET',
                    path: '/health-check',
                    hidden: true,
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                },
            },
        ],
        plugins: [hiddenFixturePlugin()],
    }).api;

describe('generateFetchClient: hidden routes and plugin routes', () => {
    it('leaves hidden routes and plugin routes out', () => {
        const output = generateFetchClient(hiddenFixtureContract());
        expect(output).toContain('listUsers');
        expect(output).not.toContain('healthCheck');
        expect(output).not.toContain('ping');
        expect(output).not.toContain('internalProbe');
    });
});

describe('a branded schema', () => {
    const branded = generateFetchClient(apiContract);

    it('declares the brand once as a named type', () => {
        expect(branded.match(/export type CenterId = string & KizunaBrand<"CenterId">;/g)).toHaveLength(1);
    });

    it('exports a constructor for the brand', () => {
        expect(branded).toContain('export const toCenterId = (value: string): API.CenterId => value as API.CenterId;');
    });

    it('refers to the brand by name wherever the schema appears', () => {
        expect(branded).toContain('centerId: CenterId;');
        expect(branded).toContain('parentId?: CenterId;');
        expect(branded).toContain('"x-actor-center": CenterId;');
        expect(branded).toContain('id: CenterId;');
        expect(branded).toContain('parentId: CenterId | null;');
    });

    it('declares the brand helper only when a brand is used', () => {
        expect(branded).toContain("readonly '~kizunaBrand': {");
        expect(source).not.toContain('KizunaBrand');
    });
});

describe('a dotted model name', () => {
    const ParcelSchema = Kizuna.model({
        title: 'Shipping.Parcel',
        schema: z.object({
            id: z.string(),
            weight: z.number(),
        }),
    });

    const TrackingEventSchema = Kizuna.model({
        title: 'Shipping.Tracking.Event',
        schema: z.object({
            parcel: ParcelSchema,
            at: z.string(),
        }),
    });

    const dotted = generateFetchClient(
        defineConfig({
            routes: [
                k.routes({
                    trackParcel: k.route({
                        method: 'GET',
                        path: '/parcels/:id/events',
                        responses: {
                            200: z.array(TrackingEventSchema),
                        },
                    }),
                }),
            ],
        }).api
    );

    it('declares the model inside a namespace per segment', () => {
        expect(dotted).toContain(
            'export namespace Shipping {\n        export type Parcel = {\n            id: string;\n            weight: number;\n        };\n\n        export namespace Tracking {\n            export type Event = {'
        );
    });

    it('references the model by its dotted name', () => {
        expect(dotted).toContain('parcel: Shipping.Parcel;');
        expect(dotted).toContain('body: Array<Shipping.Tracking.Event>;');
    });

    it('fails when a model has the name another nests under', () => {
        const ShippingSchema = Kizuna.model({
            title: 'Shipping',
            schema: z.object({
                carrier: z.string(),
            }),
        });
        const contract = defineConfig({
            routes: [
                k.routes({
                    getShipping: k.route({
                        method: 'GET',
                        path: '/shipping',
                        responses: {
                            200: z.object({
                                shipping: ShippingSchema,
                                parcel: ParcelSchema,
                            }),
                        },
                    }),
                }),
            ],
        }).api;
        expect(() => generateFetchClient(contract)).toThrow(
            '@kizunajs/fetch: "Shipping.Parcel" nests under "Shipping", which is already a type. Rename one of them.'
        );
    });
});

describe('fetchClient: groups', () => {
    const ArticleSchema = Kizuna.model({
        title: 'Article',
        schema: z.object({
            title: z.string(),
        }),
    });
    const DraftSchema = Kizuna.model({
        title: 'Draft',
        schema: z.object({
            title: z.string(),
            notes: z.string(),
        }),
    });
    const { api } = defineConfig({
        routes: [
            {
                content: {
                    articles: {
                        getArticle: k.route({
                            method: 'GET',
                            path: '/content/articles/:id',
                            responses: {
                                200: ArticleSchema,
                            },
                        }),
                    },
                },
                editing: {
                    getDraft: k.route({
                        method: 'GET',
                        path: '/editing/drafts/:id',
                        responses: {
                            200: DraftSchema,
                        },
                    }),
                },
            },
        ],
    });

    it('holds only the routes in its groups, and the models they use', () => {
        const output = fetchClient({
            output: './client.ts',
            groups: ['content'],
        }).render(api);

        expect(output).toContain('getArticle');
        expect(output).toContain('export type Article =');
        expect(output).not.toContain('getDraft');
        expect(output).not.toContain('Draft');
    });

    it('takes a nested key path', () => {
        const output = fetchClient({
            output: './client.ts',
            groups: ['content.articles'],
        }).render(api);

        expect(output).toContain('getArticle');
        expect(output).not.toContain('getDraft');
    });

    it('throws on a group no route sits in', () => {
        expect(() =>
            fetchClient({
                output: './client.ts',
                groups: ['contents'],
            }).render(api)
        ).toThrow("No route's key starts with 'contents'.");
    });
});

describe('fetchIds', () => {
    const OfficeId = Kizuna.brand('OfficeId', z.string());
    const EmployeeId = Kizuna.brand('EmployeeId', z.string());
    const Revision = Kizuna.brand('Revision', z.number());
    const { api } = defineConfig({
        routes: [
            {
                content: {
                    getEmployee: k.route({
                        method: 'GET',
                        path: '/content/employees/:id',
                        pathParams: z.object({
                            id: EmployeeId,
                        }),
                        responses: {
                            200: z.object({
                                id: EmployeeId,
                                revision: Revision,
                            }),
                        },
                    }),
                },
                editing: {
                    getOffice: k.route({
                        method: 'GET',
                        path: '/editing/offices/:id',
                        pathParams: z.object({
                            id: OfficeId,
                        }),
                        responses: {
                            200: z.object({
                                id: OfficeId,
                            }),
                        },
                    }),
                },
            },
        ],
    });

    it('declares every brand the routes carry as a Zod schema', () => {
        const output = fetchIds({
            output: './ids.ts',
        }).render(api);

        expect(output).toContain("import { Kizuna } from 'kizunajs';");
        expect(output).toContain("import { z } from 'zod';");
        expect(output).toContain("export const EmployeeId = Kizuna.brand('EmployeeId', z.string());");
        expect(output).toContain("export const OfficeId = Kizuna.brand('OfficeId', z.string());");
        expect(output).toContain("export const Revision = Kizuna.brand('Revision', z.number());");
    });

    it('holds only the brands of the routes in its groups', () => {
        const output = fetchIds({
            output: './ids.ts',
            groups: ['content'],
        }).render(api);

        expect(output).toContain('EmployeeId');
        expect(output).not.toContain('OfficeId');
    });

    it('declares the brands the client of the same groups names', () => {
        const client = fetchClient({
            output: './client.ts',
            groups: ['content'],
        }).render(api);
        const ids = fetchIds({
            output: './ids.ts',
            groups: ['content'],
        }).render(api);

        const named = [...client.matchAll(/export type (\w+) = \w+ & KizunaBrand</g)].map((match) => match[1]);
        const declared = [...ids.matchAll(/export const (\w+) = Kizuna\.brand/g)].map((match) => match[1]);
        expect(declared).toEqual(named);
    });

    it('leaves the client importing nothing', () => {
        const client = fetchClient({
            output: './client.ts',
        }).render(api);

        expect(client).not.toMatch(/^import /m);
    });

    it('exports nothing when the routes carry no brand', () => {
        const output = fetchIds({
            output: './ids.ts',
        }).render(
            defineConfig({
                routes: [routes],
            }).api
        );

        expect(output).not.toMatch(/^import /m);
        expect(output).toContain('export {};');
    });
});
