import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import toBeAValidOpenAPIDefinition from 'jest-expect-openapi';
import { Kizuna, type ApiDefinition } from 'kizunajs';
import { defineConfig } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import { renderOpenApi } from './generator.js';
import type { GenerateOpenApiOptions } from './types.js';

interface Config {
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});
const config = {
    tags: kTags,
};

const generateJson = (contract: ApiDefinition, options: GenerateOpenApiOptions) => renderOpenApi(contract, options)('json');

expect.extend({
    toBeAValidOpenAPIDefinition,
});

declare module 'vitest' {
    interface Matchers<T = any> {
        toBeAValidOpenAPIDefinition(transformer?: (spec: Record<string, unknown>) => Record<string, unknown>): Promise<T>;
    }
}

const contractRoutes = k.routes('api', {
    getUser: k.route({
        method: 'GET',
        path: '/users/:id',
        summary: 'Get a user',
        responses: {
            200: z.object({
                id: z.string(),
                name: z.string(),
            }),
            404: z.object({
                message: z.string(),
            }),
        },
    }),
    createUser: k.route({
        method: 'POST',
        path: '/users',
        summary: 'Create a user',
        body: z.object({
            name: z.string(),
            email: z.email(),
        }),
        responses: {
            201: z.object({
                id: z.string(),
                name: z.string(),
                email: z.string(),
            }),
        },
    }),
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        auth: false,
        query: z.object({
            page: z.number().optional(),
            limit: z.number().optional(),
        }),
        responses: {
            200: z.object({
                users: z.array(
                    z.object({
                        id: z.string(),
                    })
                ),
            }),
        },
    }),
});

const contract = defineConfig({
    ...config,
    routes: contractRoutes,
}).api;

const baseConfig = {
    info: {
        title: 'Test API',
        version: '1.0.0',
    },
};

describe('generateOpenApi', () => {
    const spec = generateJson(contract, baseConfig);

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });

    it('produces OpenAPI 3.1.0 with provided info', () => {
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info.title).toBe('Test API');
        expect(spec.info.version).toBe('1.0.0');
    });

    it('converts :param paths to {param}', () => {
        expect(spec.paths['/users/{id}']).toBeDefined();
        expect(spec.paths['/users/:id']).toBeUndefined();
    });

    it('emits all routes under their methods', () => {
        expect(spec.paths['/users/{id}']?.get).toBeDefined();
        expect(spec.paths['/users']?.get).toBeDefined();
        expect(spec.paths['/users']?.post).toBeDefined();
    });

    it('includes path parameters', () => {
        const params = spec.paths['/users/{id}']?.get?.parameters;
        const idParam = params?.find((parameter) => parameter.name === 'id');
        expect(idParam?.in).toBe('path');
        expect(idParam?.required).toBe(true);
    });

    it('includes query parameters', () => {
        const params = spec.paths['/users']?.get?.parameters;
        const pageParam = params?.find((parameter) => parameter.name === 'page');
        expect(pageParam?.in).toBe('query');
    });

    it('includes a JSON request body for POST', () => {
        const post = spec.paths['/users']?.post;
        expect(post?.requestBody?.content?.['application/json']?.schema).toBeDefined();
    });

    it('keys responses by status code', () => {
        const get = spec.paths['/users/{id}']?.get;
        expect(get?.responses['200']).toBeDefined();
        expect(get?.responses['404']).toBeDefined();
    });

    it('includes summary from contract', () => {
        expect(spec.paths['/users/{id}']?.get?.summary).toBe('Get a user');
        expect(spec.paths['/users']?.post?.summary).toBe('Create a user');
    });

    it('sets operationId when enabled', () => {
        const withIds = generateJson(contract, { ...baseConfig, setOperationId: true });
        expect(withIds.paths['/users/{id}']?.get?.operationId).toBe('getUser');
        expect(withIds.paths['/users']?.post?.operationId).toBe('createUser');
    });

    it('sets concatenated-path operationId for nested routers', () => {
        const nestedRoutes = k.routes('api', {
            users: {
                getUser: k.route({
                    method: 'GET',
                    path: '/users/:id',
                    responses: {
                        200: z.object({
                            id: z.string(),
                        }),
                    },
                }),
            },
        });

        const nested = defineConfig({
            ...config,
            routes: nestedRoutes,
        }).api;

        const withTrue = generateJson(nested, { ...baseConfig, setOperationId: true });
        expect(withTrue.paths['/users/{id}']?.get?.operationId).toBe('getUser');

        const withConcatenated = generateJson(nested, { ...baseConfig, setOperationId: 'concatenated-path' });
        expect(withConcatenated.paths['/users/{id}']?.get?.operationId).toBe('users.getUser');
    });

    it('omits requestBody and response content for z.void()', () => {
        const voidContractRoutes = k.routes('api', {
            ping: k.route({
                method: 'POST',
                path: '/ping/:id',
                body: z.void(),
                responses: {
                    204: z.void(),
                },
            }),
        });

        const voidContract = defineConfig({
            ...config,
            routes: voidContractRoutes,
        }).api;
        const doc = generateJson(voidContract, baseConfig);
        const operation = doc.paths['/ping/{id}']?.post;
        expect(operation?.requestBody).toBeUndefined();
        expect(operation?.responses['204']?.content).toBeUndefined();
        expect(operation?.responses['204']?.description).toBe('No Content');
    });

    it('applies operationMapper', () => {
        const tagged = generateJson(contract, {
            ...baseConfig,
            operationMapper: (operation) => ({
                ...operation,
                tags: ['users'],
            }),
        });
        expect(tagged.paths['/users/{id}']?.get?.tags).toEqual(['users']);
    });
});

describe('Zod meta() in OpenAPI output', () => {
    const Tagged = Kizuna.model({
        title: 'TaggedUser',
        schema: z.object({
            id: z.string().meta({
                description: 'User ID',
                example: 'usr_123',
            }),
            name: z.string().meta({
                description: 'Display name',
            }),
            email: z.email(),
        }),
    });

    const taggedContractRoutes = k.routes('api', {
        getUser: k.route({
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: Tagged,
            },
        }),
    });

    const taggedContract = defineConfig({
        ...config,
        routes: taggedContractRoutes,
    }).api;

    it('is a valid OpenAPI 3.1 document', async () => {
        const spec = generateJson(taggedContract, baseConfig);
        await expect(spec).toBeAValidOpenAPIDefinition();
    });

    it('extracts id-tagged schemas into components.schemas as $refs', () => {
        const spec = generateJson(taggedContract, baseConfig);
        expect(spec.components?.schemas?.TaggedUser).toBeDefined();
        const responseSchema = spec.paths['/users/{id}']?.get?.responses['200']?.content?.['application/json']?.schema;
        expect(responseSchema).toEqual({
            $ref: '#/components/schemas/TaggedUser',
        });
    });

    it('preserves description and emits example as examples on properties', () => {
        const spec = generateJson(taggedContract, baseConfig);
        const userSchema = spec.components?.schemas?.TaggedUser as Record<string, unknown> | undefined;
        const properties = (userSchema?.properties ?? {}) as Record<string, Record<string, unknown>>;
        expect(properties['id']?.description).toBe('User ID');
        expect(properties['id']?.examples).toEqual(['usr_123']);
        expect(properties['name']?.description).toBe('Display name');
    });

    it('ignores a raw .meta({ id }) set without Kizuna.model', () => {
        const rawTagged = z
            .object({
                id: z.string(),
            })
            .meta({
                id: 'RawTagged',
            });
        const rawRoutes = k.routes('api', {
            getRaw: k.route({
                method: 'GET',
                path: '/raw',
                responses: {
                    200: rawTagged,
                },
            }),
        });
        const spec = generateJson(
            defineConfig({
                ...config,
                routes: rawRoutes,
            }).api,
            baseConfig
        );
        expect(spec.components?.schemas?.RawTagged).toBeUndefined();
        const responseSchema = spec.paths['/raw']?.get?.responses['200']?.content?.['application/json']?.schema;
        expect(responseSchema).not.toEqual({
            $ref: '#/components/schemas/RawTagged',
        });
    });
});

describe('operation metadata passthrough', () => {
    const kTaggedTags = k.tags({
        api: 'API',
        users: 'Users',
    });
    const kTaggedConfig = {
        tags: kTaggedTags,
    };
    const kTagged = new Kizuna<{
        tags: typeof kTaggedTags;
    }>();
    const annotatedRoutes = kTagged.routes('api', {
        getUser: kTagged.route({
            method: 'GET',
            path: '/users/:id',
            tags: ['users'],
            externalDocs: {
                url: 'https://example.com/docs/getUser',
                description: 'Reference docs',
            },
            responses: {
                200: z.object({
                    id: z.string(),
                }),
            },
        }),
    });

    const annotated = defineConfig({
        ...kTaggedConfig,
        routes: annotatedRoutes,
    }).api;

    it('is a valid OpenAPI 3.1 document', async () => {
        const spec = generateJson(annotated, baseConfig);
        await expect(spec).toBeAValidOpenAPIDefinition();
    });

    it('emits route-level tags and externalDocs on the operation', () => {
        const spec = generateJson(annotated, baseConfig);
        const operation = spec.paths['/users/{id}']?.get;
        expect(operation?.tags).toEqual(['API', 'Users']);
        expect(operation?.externalDocs).toEqual({
            url: 'https://example.com/docs/getUser',
            description: 'Reference docs',
        });
    });

    it('emits document-level tags from the contract, and externalDocs from config', () => {
        const spec = generateJson(annotated, {
            ...baseConfig,
            externalDocs: {
                url: 'https://example.com/docs',
            },
        });
        expect(spec.tags).toEqual([
            {
                name: 'API',
            },
            {
                name: 'Users',
            },
        ]);
        expect(spec.externalDocs).toEqual({
            url: 'https://example.com/docs',
        });
    });

    it('lets operationMapper override route-declared tags', () => {
        const spec = generateJson(annotated, {
            ...baseConfig,
            operationMapper: (operation) => ({
                ...operation,
                tags: ['mapped'],
            }),
        });
        expect(spec.paths['/users/{id}']?.get?.tags).toEqual(['mapped']);
    });

    it('merges route-level tags with the group tag', () => {
        const k2Tags = k.tags({
            users: {
                title: 'Users',
            },
            health: {
                title: 'Health',
            },
        });
        const k2Config = {
            tags: k2Tags,
        };
        const k2 = new Kizuna<{
            tags: typeof k2Tags;
        }>();
        const usersRoutes = k2.routes('users', {
            getUser: k2.route({
                method: 'GET',
                path: '/users/:id',
                tags: ['health'],
                responses: {
                    200: z.object({
                        id: z.string(),
                    }),
                },
            }),
        });
        const contract = defineConfig({
            ...k2Config,
            routes: usersRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        expect(spec.paths['/users/{id}']?.get?.tags).toEqual(['Users', 'Health']);
    });
});

describe('discriminated unions', () => {
    it('is a valid OpenAPI 3.1 document', async () => {
        const Image = Kizuna.model({
            title: 'ValidImage',
            schema: z.object({
                type: z.literal('image'),
                src: z.string(),
            }),
        });
        const Video = Kizuna.model({
            title: 'ValidVideo',
            schema: z.object({
                type: z.literal('video'),
                url: z.string(),
            }),
        });
        const routeRoutes = k.routes('api', {
            getMedia: k.route({
                method: 'GET',
                path: '/media',
                responses: {
                    200: z.discriminatedUnion('type', [Image, Video]),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        await expect(generateJson(route, baseConfig)).toBeAValidOpenAPIDefinition();
    });

    it('emits oneOf + discriminator with mapping when variants are id-tagged', () => {
        const Image = Kizuna.model({
            title: 'DiscImage',
            schema: z.object({
                type: z.literal('image'),
                src: z.string(),
            }),
        });
        const Video = Kizuna.model({
            title: 'DiscVideo',
            schema: z.object({
                type: z.literal('video'),
                url: z.string(),
            }),
        });
        const routeRoutes = k.routes('api', {
            getMedia: k.route({
                method: 'GET',
                path: '/media',
                responses: {
                    200: z.discriminatedUnion('type', [Image, Video]),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        const schema = spec.paths['/media']?.get?.responses['200']?.content?.['application/json']?.schema as Record<string, unknown>;
        expect(schema?.oneOf).toEqual([
            {
                $ref: '#/components/schemas/DiscImage',
            },
            {
                $ref: '#/components/schemas/DiscVideo',
            },
        ]);
        expect(schema?.discriminator).toEqual({
            propertyName: 'type',
            mapping: {
                image: '#/components/schemas/DiscImage',
                video: '#/components/schemas/DiscVideo',
            },
        });
    });

    it('emits discriminator without mapping when variants are not id-tagged', () => {
        const routeRoutes = k.routes('api', {
            getMedia: k.route({
                method: 'GET',
                path: '/inline-media',
                responses: {
                    200: z.discriminatedUnion('kind', [
                        z.object({
                            kind: z.literal('a'),
                            value: z.string(),
                        }),
                        z.object({
                            kind: z.literal('b'),
                            value: z.number(),
                        }),
                    ]),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        const schema = spec.paths['/inline-media']?.get?.responses['200']?.content?.['application/json']?.schema as Record<string, unknown>;
        expect(Array.isArray(schema?.oneOf)).toBe(true);
        expect((schema?.oneOf as unknown[]).length).toBe(2);
        expect(schema?.discriminator).toEqual({
            propertyName: 'kind',
        });
    });

    it('attaches discriminator to a registered union via components.schemas', () => {
        const EmailEvent = Kizuna.model({
            title: 'EmailEvent',
            schema: z.object({
                channel: z.literal('email'),
                to: z.string(),
            }),
        });
        const SmsEvent = Kizuna.model({
            title: 'SmsEvent',
            schema: z.object({
                channel: z.literal('sms'),
                phone: z.string(),
            }),
        });
        const NotificationEvent = Kizuna.model({
            title: 'NotificationEvent',
            schema: z.discriminatedUnion('channel', [EmailEvent, SmsEvent]),
        });
        const routeRoutes = k.routes('api', {
            sendNotification: k.route({
                method: 'POST',
                path: '/notifications',
                body: NotificationEvent,
                responses: {
                    202: z.object({
                        accepted: z.boolean(),
                    }),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        const requestSchema = spec.paths['/notifications']?.post?.requestBody?.content?.['application/json']?.schema;
        expect(requestSchema).toEqual({
            $ref: '#/components/schemas/NotificationEvent',
        });
        const component = spec.components?.schemas?.NotificationEvent as Record<string, unknown> | undefined;
        expect(component?.oneOf).toEqual([
            {
                $ref: '#/components/schemas/EmailEvent',
            },
            {
                $ref: '#/components/schemas/SmsEvent',
            },
        ]);
        expect(component?.discriminator).toEqual({
            propertyName: 'channel',
            mapping: {
                email: '#/components/schemas/EmailEvent',
                sms: '#/components/schemas/SmsEvent',
            },
        });
    });

    it('does not add discriminator to plain z.union', () => {
        const routeRoutes = k.routes('api', {
            getOne: k.route({
                method: 'GET',
                path: '/plain-union',
                responses: {
                    200: z.union([z.string(), z.number()]),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        const schema = spec.paths['/plain-union']?.get?.responses['200']?.content?.['application/json']?.schema as Record<string, unknown>;
        expect(schema?.discriminator).toBeUndefined();
    });
});

describe('request body content types', () => {
    it('is a valid OpenAPI 3.1 document', async () => {
        const routeRoutes = k.routes('api', {
            uploadAvatar: k.route({
                method: 'POST',
                path: '/avatar',
                contentType: 'multipart/form-data',
                body: z.object({
                    file: z.instanceof(File),
                    name: z.string(),
                }),
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            postForm: k.route({
                method: 'POST',
                path: '/form',
                contentType: 'application/x-www-form-urlencoded',
                body: z.object({
                    name: z.string(),
                }),
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            postUser: k.route({
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
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        await expect(generateJson(route, baseConfig)).toBeAValidOpenAPIDefinition();
    });

    it('emits multipart/form-data when contentType is set, with format: binary for File fields', () => {
        const routeRoutes = k.routes('api', {
            uploadAvatar: k.route({
                method: 'POST',
                path: '/avatar',
                contentType: 'multipart/form-data',
                body: z.object({
                    file: z.instanceof(File),
                    name: z.string(),
                }),
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        const body = spec.paths['/avatar']?.post?.requestBody;
        expect(body?.content?.['multipart/form-data']).toBeDefined();
        expect(body?.content?.['application/json']).toBeUndefined();
        const schema = body?.content?.['multipart/form-data']?.schema as Record<string, unknown>;
        const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
        expect(properties['file']).toEqual({
            type: 'string',
            format: 'binary',
        });
        expect(properties['name']).toEqual({
            type: 'string',
        });
    });

    it('emits application/x-www-form-urlencoded when contentType is set', () => {
        const routeRoutes = k.routes('api', {
            postForm: k.route({
                method: 'POST',
                path: '/form',
                contentType: 'application/x-www-form-urlencoded',
                body: z.object({
                    name: z.string(),
                }),
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        const body = spec.paths['/form']?.post?.requestBody;
        expect(body?.content?.['application/x-www-form-urlencoded']).toBeDefined();
        expect(body?.content?.['application/json']).toBeUndefined();
    });

    it('defaults to application/json when contentType is not set', () => {
        const routeRoutes = k.routes('api', {
            postUser: k.route({
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
            }),
        });

        const route = defineConfig({
            ...config,
            routes: routeRoutes,
        }).api;
        const spec = generateJson(route, baseConfig);
        expect(spec.paths['/users']?.post?.requestBody?.content?.['application/json']).toBeDefined();
    });
});

describe('transform field handling', () => {
    it('uses input schema for request body transform fields', () => {
        const contractRoutes = k.routes('api', {
            createUser: k.route({
                method: 'POST',
                path: '/users',
                body: z.object({
                    name: z.string().transform((value) => value.trim()),
                    age: z.number().optional(),
                }),
                responses: {
                    201: z.object({
                        id: z.string(),
                    }),
                },
            }),
        });

        const contract = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        const properties = spec.paths['/users']?.post?.requestBody?.content?.['application/json']?.schema?.properties as
            | Record<string, unknown>
            | undefined;
        expect(properties?.['name']).toEqual({
            type: 'string',
        });
        expect(properties?.['age']).toEqual({
            type: 'number',
        });
    });

    it('uses input schema for transform fields in union query params', () => {
        const contractRoutes = k.routes('api', {
            getItems: k.route({
                method: 'GET',
                path: '/items',
                query: z.object({
                    ids: z.union([
                        z.array(z.string().uuid()).min(1).max(20),
                        z
                            .string()
                            .uuid()
                            .transform((id) => [id]),
                    ]),
                }),
                responses: {
                    200: z.object({
                        items: z.array(z.string()),
                    }),
                },
            }),
        });

        const contract = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        const schema = spec.paths['/items']?.get?.parameters?.find((parameter) => parameter.name === 'ids')?.schema as
            | Record<string, unknown>
            | undefined;
        const branches = schema?.anyOf as Array<Record<string, unknown>> | undefined;
        expect(branches?.[1]).toMatchObject({
            type: 'string',
            format: 'uuid',
        });
    });
});

describe('complex transform edge cases', () => {
    it('handles transforms across nested objects, arrays, records, tuples, unions, nullable, and intersections without producing {}', () => {
        const insaneRoutes = k.routes('api', {
            users: {
                create: k.route({
                    method: 'POST',
                    path: '/users',
                    body: z.object({
                        name: z.string(),
                        username: z.string().transform((value) => value.toLowerCase()),
                        bio: z
                            .string()
                            .transform((value) => value.trim())
                            .nullable(),
                        tags: z.array(z.string().transform((value) => value.trim())),
                        coords: z.tuple([z.number(), z.number(), z.string().transform(Number)]),
                        metadata: z.record(
                            z.string(),
                            z.string().transform((value) => value.trim())
                        ),
                        identifier: z.union([z.string().uuid(), z.string().transform((value) => value.toLowerCase())]),
                        address: z.object({
                            street: z.string().transform((value) => value.trim()),
                            city: z.string(),
                            zip: z.string().transform((value) => value.replace(/\s/g, '')),
                        }),
                        extra: z.intersection(
                            z.object({
                                score: z.number(),
                            }),
                            z.object({
                                label: z.string().transform((value) => value.trim()),
                            })
                        ),
                    }),
                    responses: {
                        201: z.object({
                            id: z.string().uuid(),
                        }),
                        400: z.object({
                            message: z.string(),
                        }),
                    },
                }),
                list: k.route({
                    method: 'GET',
                    path: '/users',
                    query: z.object({
                        page: z.string().transform(Number),
                        perPage: z.string().transform(Number).optional(),
                        filter: z
                            .union([
                                z.literal('active'),
                                z
                                    .string()
                                    .min(1)
                                    .transform((value) => value.trim()),
                            ])
                            .optional(),
                    }),
                    responses: {
                        200: z.object({
                            items: z.array(
                                z.object({
                                    id: z.string(),
                                    name: z.string(),
                                })
                            ),
                            total: z.number(),
                        }),
                    },
                }),
            },
        });

        const insane = defineConfig({
            ...config,
            routes: insaneRoutes,
        }).api;

        const spec = generateJson(insane, baseConfig);
        const json = JSON.stringify(spec);

        expect(json).not.toMatch(/"items":\{\}/);
        expect(json).not.toMatch(/"additionalProperties":\{\}/);
        expect(json).not.toMatch(/"prefixItems":\[\{\}/);

        const createBody = spec.paths['/users']?.post?.requestBody?.content?.['application/json']?.schema;
        const bodyProps = createBody?.properties as Record<string, unknown>;

        expect(bodyProps?.['username']).toEqual({ type: 'string' });
        expect((bodyProps?.['bio'] as Record<string, unknown>)?.['anyOf']).toMatchObject([{ type: 'string' }, { type: 'null' }]);
        expect(bodyProps?.['tags']).toMatchObject({ type: 'array', items: { type: 'string' } });
        expect((bodyProps?.['metadata'] as Record<string, unknown>)?.['additionalProperties']).toEqual({ type: 'string' });
        expect((bodyProps?.['coords'] as Record<string, unknown>)?.['prefixItems']).toMatchObject([
            { type: 'number' },
            { type: 'number' },
            { type: 'string' },
        ]);

        const addressProps = (bodyProps?.['address'] as Record<string, unknown>)?.['properties'] as Record<string, unknown>;
        expect(addressProps?.['street']).toEqual({ type: 'string' });
        expect(addressProps?.['zip']).toEqual({ type: 'string' });

        const extraAllOf = (bodyProps?.['extra'] as Record<string, unknown>)?.['allOf'] as Array<Record<string, unknown>>;
        const extraSecondProps = extraAllOf?.[1]?.['properties'] as Record<string, unknown>;
        expect(extraSecondProps?.['label']).toEqual({ type: 'string' });
    });
});

describe('response headers', () => {
    it('emits OpenAPI headers object on the response when headers are declared', () => {
        const contractRoutes = k.routes('api', {
            getUser: k.route({
                method: 'GET',
                path: '/users/:id',
                responses: {
                    200: {
                        body: z.object({ id: z.string() }),
                        headers: z.object({ 'x-request-id': z.string().optional() }),
                    },
                    404: z.object({ message: z.string() }),
                },
            }),
        });

        const contract = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const spec = generateJson(contract, {
            info: {
                title: 'Test',
                version: '1',
            },
        });
        const response200 = spec.paths['/users/{id}']?.get?.responses?.['200'] as unknown as Record<string, unknown>;
        const response404 = spec.paths['/users/{id}']?.get?.responses?.['404'] as unknown as Record<string, unknown>;

        expect(response200?.['headers']).toEqual({
            'x-request-id': {
                schema: {
                    type: 'string',
                },
                required: false,
            },
        });
        expect(response404?.['headers']).toBeUndefined();
    });
});

describe('contract-level tag grouping', () => {
    it('applies the group tag to all routes in that group', () => {
        const k3Tags = k.tags({
            users: {
                title: 'Users',
            },
        });
        const k3Config = {
            tags: k3Tags,
        };
        const k3 = new Kizuna<{
            tags: typeof k3Tags;
        }>();
        const usersRoutes = k3.routes('users', {
            listUsers: k3.route({
                method: 'GET',
                path: '/users',
                auth: false,
                responses: {
                    200: z.object({ users: z.array(z.string()) }),
                },
            }),
            createUser: k3.route({
                method: 'POST',
                path: '/users',
                body: z.object({ name: z.string() }),
                responses: {
                    201: z.object({ id: z.string() }),
                },
            }),
        });
        const contract = defineConfig({
            ...k3Config,
            routes: usersRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        expect(spec.paths['/users']?.get?.tags).toEqual(['Users']);
        expect(spec.paths['/users']?.post?.tags).toEqual(['Users']);
    });

    it('accumulates tags from nested tagged groups', () => {
        const k4Tags = k.tags({
            users: {
                title: 'Users',
            },
            health: {
                title: 'Health',
            },
        });
        const k4Config = {
            tags: k4Tags,
        };
        const k4 = new Kizuna<{
            tags: typeof k4Tags;
        }>();
        const healthRoutes = k4.routes('health', {
            deleteUser: k4.route({
                method: 'DELETE',
                path: '/users/:id',
                responses: {
                    200: z.object({ success: z.boolean() }),
                },
            }),
        });
        const usersRoutes = k4.routes('users', {
            health: healthRoutes,
        });
        const contract = defineConfig({
            ...k4Config,
            routes: usersRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        expect(spec.paths['/users/{id}']?.delete?.tags).toEqual(['Users', 'Health']);
    });

    it('collects tag descriptions into the document tags', () => {
        const k5Tags = k.tags({
            users: {
                title: 'Users',
                description: 'User management endpoints',
            },
        });
        const k5Config = {
            tags: k5Tags,
        };
        const k5 = new Kizuna<{
            tags: typeof k5Tags;
        }>();
        const usersRoutes = k5.routes('users', {
            listUsers: k5.route({
                method: 'GET',
                path: '/users',
                auth: false,
                responses: {
                    200: z.object({ ok: z.boolean() }),
                },
            }),
        });
        const contract = defineConfig({
            ...k5Config,
            routes: usersRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        expect(spec.tags).toEqual([
            {
                name: 'Users',
                description: 'User management endpoints',
            },
        ]);
    });

    it('an untagged sub-group inside a tagged group inherits the outer tag', () => {
        const k6Tags = k.tags({
            users: {
                title: 'Users',
            },
        });
        const k6Config = {
            tags: k6Tags,
        };
        const k6 = new Kizuna<{
            tags: typeof k6Tags;
        }>();
        const usersRoutes = k6.routes('users', {
            nested: {
                listUsers: k6.route({
                    method: 'GET',
                    path: '/users',
                    auth: false,
                    responses: {
                        200: z.object({ users: z.array(z.string()) }),
                    },
                }),
            },
        });
        const contract = defineConfig({
            ...k6Config,
            routes: usersRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        expect(spec.paths['/users']?.get?.tags).toEqual(['Users']);
    });
});

describe('OpenAPI generator: HEAD method', () => {
    it('omits response content for HEAD routes', () => {
        const contractRoutes = k.routes('api', {
            checkUser: k.route({
                method: 'HEAD',
                path: '/users/:id',
                responses: {
                    200: z.object({
                        id: z.string(),
                    }),
                    404: z.void(),
                },
            }),
        });

        const contract = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        const headOp = spec.paths['/users/{id}']?.head;
        expect(headOp).toBeDefined();
        expect(headOp?.responses?.['200']?.content).toBeUndefined();
        expect(headOp?.responses?.['404']?.content).toBeUndefined();
    });

    it('does not document derived HEAD by default', () => {
        const spec = generateJson(contract, baseConfig);
        expect(spec.paths['/users/{id}']?.head).toBeUndefined();
        expect(spec.paths['/users']?.head).toBeUndefined();
    });

    it('derivedHead documents a head operation on every GET path without a declared one', () => {
        const spec = generateJson(contract, {
            ...baseConfig,
            setOperationId: true,
            derivedHead: true,
        });
        const headOp = spec.paths['/users/{id}']?.head;
        expect(headOp).toBeDefined();
        expect(headOp?.summary).toBe('Get a user');
        expect(headOp?.parameters).toEqual(spec.paths['/users/{id}']?.get?.parameters);
        expect(headOp?.operationId).toBeUndefined();
        expect(headOp?.responses?.['200']?.content).toBeUndefined();
        expect(headOp?.responses?.['404']?.content).toBeUndefined();
        expect(spec.paths['/users/{id}']?.get?.responses?.['200']?.content).toBeDefined();
    });

    it('derivedHead leaves a declared HEAD route alone', () => {
        const contractRoutes = k.routes('api', {
            getReport: k.route({
                method: 'GET',
                path: '/report',
                responses: {
                    200: z.object({
                        rows: z.number(),
                    }),
                },
            }),
            checkReport: k.route({
                method: 'HEAD',
                path: '/report',
                summary: 'Check the report',
                responses: {
                    204: z.void(),
                },
            }),
        });

        const contract = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const spec = generateJson(contract, {
            ...baseConfig,
            derivedHead: true,
        });
        const headOp = spec.paths['/report']?.head;
        expect(headOp?.summary).toBe('Check the report');
        expect(headOp?.responses?.['204']).toBeDefined();
        expect(headOp?.responses?.['200']).toBeUndefined();
    });

    it('OPTIONS routes emit response content normally', () => {
        const contractRoutes = k.routes('api', {
            describeUsers: k.route({
                method: 'OPTIONS',
                path: '/users',
                responses: {
                    200: z.object({
                        allow: z.string(),
                    }),
                },
            }),
        });

        const contract = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const spec = generateJson(contract, baseConfig);
        const optionsOp = spec.paths['/users']?.options;
        expect(optionsOp).toBeDefined();
        expect(optionsOp?.responses?.['200']?.content).toBeDefined();
    });
});

describe('automatic validation error response', () => {
    const spec = generateJson(contract, baseConfig);

    it('adds 400 validation error to routes with body', () => {
        const response = spec.paths['/users']?.post?.responses?.['400'];
        expect(response).toBeDefined();
        expect(response?.description).toBe('Bad Request');
        const schema = response?.content?.['application/problem+json']?.schema as Record<string, unknown> | undefined;
        expect(schema?.required).toContain('detail');
        expect(schema?.required).toContain('errors');
        const properties = schema?.properties as Record<string, Record<string, unknown>> | undefined;
        expect(properties?.errors?.type).toBe('array');
    });

    it('adds 400 validation error to routes with query', () => {
        const response = spec.paths['/users']?.get?.responses?.['400'];
        expect(response).toBeDefined();
        expect(response?.description).toBe('Bad Request');
    });

    it('does not add 400 to routes without body or query', () => {
        const response = spec.paths['/users/{id}']?.get?.responses?.['400'];
        expect(response).toBeUndefined();
    });

    it('merges with a user-declared 400 using oneOf', () => {
        const contractWith400Routes = k.routes('api', {
            createItem: k.route({
                method: 'POST',
                path: '/items',
                body: z.object({ name: z.string() }),
                responses: {
                    201: z.object({ id: z.string() }),
                    400: z.object({ error: z.string() }),
                },
            }),
        });

        const contractWith400 = defineConfig({
            ...config,
            routes: contractWith400Routes,
        }).api;
        const spec = generateJson(contractWith400, baseConfig);
        const response = spec.paths['/items']?.post?.responses?.['400'];
        const schema = response?.content?.['application/problem+json']?.schema as Record<string, unknown> | undefined;
        const oneOf = schema?.oneOf as Array<Record<string, unknown>> | undefined;
        expect(oneOf).toHaveLength(2);
        expect(oneOf?.[1]?.required).toContain('errors');
    });
});

describe('deprecation from metadata', () => {
    const UserSchema = Kizuna.model({
        title: 'DeprecationUser',
        schema: z.object({
            id: z.string(),
            email: z.string().meta({
                deprecated: 'use `email_address`',
            }),
        }),
    });
    const AccountSchema = Kizuna.model({
        title: 'DeprecationAccount',
        schema: z.object({
            owner: z.object({
                user: UserSchema,
            }),
        }),
    });
    const deprecationRoutes = k.routes('api', {
        getAccount: k.route({
            method: 'GET',
            path: '/account',
            responses: {
                200: AccountSchema,
            },
        }),
        oldRoute: k.route({
            method: 'GET',
            path: '/old',
            deprecated: 'use newRoute instead',
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
        inlineField: k.route({
            method: 'GET',
            path: '/inline',
            responses: {
                200: z.object({
                    name: z.string().meta({
                        deprecated: true,
                    }),
                    fullName: z.string(),
                }),
            },
        }),
    });

    const deprecationContract = defineConfig({
        ...config,
        routes: deprecationRoutes,
    }).api;
    const spec = generateJson(deprecationContract, baseConfig);

    it('marks a deprecated field on its component schema, normalising a string message to true', () => {
        const userSchema = spec.components?.schemas?.DeprecationUser as Record<string, Record<string, Record<string, unknown>>> | undefined;
        expect(userSchema?.properties?.['email']?.deprecated).toBe(true);
    });

    it('marks a deprecated route operation', () => {
        expect(spec.paths['/old']?.get?.deprecated).toBe(true);
    });

    it('leaves non-deprecated routes unmarked', () => {
        expect(spec.paths['/account']?.get?.deprecated).toBeUndefined();
    });

    it('marks a deprecated inline response field and leaves its siblings unmarked', () => {
        const responseSchema = spec.paths['/inline']?.get?.responses['200']?.content?.['application/json']?.schema as
            | Record<string, Record<string, Record<string, unknown>>>
            | undefined;
        expect(responseSchema?.properties?.['name']?.deprecated).toBe(true);
        expect(responseSchema?.properties?.['fullName']?.deprecated).toBeUndefined();
    });

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });
});

describe('examples from metadata', () => {
    const EventSchema = Kizuna.model({
        title: 'ExampleEvent',
        schema: z.object({
            id: z.string().meta({
                example: 'evt_123',
            }),
            example: z.string(),
        }),
    });
    const exampleRoutes = k.routes('api', {
        listEvents: k.route({
            method: 'GET',
            path: '/events',
            auth: 'user',
            responses: {
                200: EventSchema,
            },
        }),
        createEvent: k.route({
            method: 'POST',
            path: '/events',
            body: z.object({
                name: z.string().meta({
                    example: ['Launch party', 'Board meeting'],
                }),
            }),
            responses: {
                201: EventSchema,
            },
        }),
    });

    const exampleContract = defineConfig({
        ...config,
        routes: exampleRoutes,
    }).api;
    const spec = generateJson(exampleContract, baseConfig);
    const eventSchema = spec.components?.schemas?.ExampleEvent as Record<string, Record<string, Record<string, unknown>>> | undefined;

    it('emits a field example as JSON Schema `examples` on its component schema', () => {
        expect(eventSchema?.properties?.['id']?.examples).toEqual(['evt_123']);
        expect(eventSchema?.properties?.['id']?.example).toBeUndefined();
    });

    it('leaves a property named `example` untouched', () => {
        expect(eventSchema?.properties?.['example']).toEqual({
            type: 'string',
        });
    });

    it('emits an example array as multiple JSON Schema examples', () => {
        const bodySchema = spec.paths['/events']?.post?.requestBody?.content?.['application/json']?.schema as
            | Record<string, Record<string, Record<string, unknown>>>
            | undefined;
        expect(bodySchema?.properties?.['name']?.examples).toEqual(['Launch party', 'Board meeting']);
    });

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });
});

describe('deprecation and sunset headers', () => {
    const headerRoutes = k.routes('api', {
        deleteUser: k.route({
            method: 'DELETE',
            path: '/users/:id',
            deprecated: {
                message: 'use archiveUser instead',
                date: '2026-03-01T00:00:00Z',
                link: 'https://example.com/changelog/delete-user',
            },
            sunset: {
                date: '2027-01-01T00:00:00Z',
                link: 'https://example.com/retirement-policy',
            },
            query: z.object({
                force: z.boolean().default(false),
            }),
            responses: {
                200: z.object({
                    success: z.boolean(),
                }),
                404: ProblemDetailsSchema,
            },
        }),
        exportReport: k.route({
            method: 'GET',
            path: '/report',
            sunset: '2027-01-01T00:00:00Z',
            responses: {
                200: z.object({
                    ok: z.boolean(),
                }),
            },
        }),
    });

    const headerContract = defineConfig({
        ...config,
        routes: headerRoutes,
    }).api;
    const spec = generateJson(headerContract, baseConfig);

    it('marks the object form deprecated operation', () => {
        expect(spec.paths['/users/{id}']?.delete?.deprecated).toBe(true);
    });

    it('documents the Deprecation, Sunset, and Link headers on every response', () => {
        const responses = spec.paths['/users/{id}']?.delete?.responses ?? {};
        expect(Object.keys(responses).sort()).toEqual(['200', '400', '404']);
        for (const response of Object.values(responses)) {
            expect(Object.keys(response.headers ?? {})).toEqual(['Deprecation', 'Sunset', 'Link']);
        }
    });

    it('documents only the Sunset header on a route with a bare sunset', () => {
        const response = spec.paths['/report']?.get?.responses['200'];
        expect(Object.keys(response?.headers ?? {})).toEqual(['Sunset']);
    });

    it('documents no headers on a route with neither', () => {
        const plain = generateJson(
            defineConfig({
                ...config,
                routes: k.routes('api', {
                    getUser: k.route({
                        method: 'GET',
                        path: '/users/:id',
                        responses: {
                            200: z.object({
                                id: z.string(),
                            }),
                        },
                    }),
                }),
            }).api,
            baseConfig
        );
        expect(plain.paths['/users/{id}']?.get?.responses['200']?.headers).toBeUndefined();
    });

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });
});

describe('cache headers', () => {
    const cachedContract = defineConfig({
        ...config,
        routes: k.routes('api', {
            listUsers: k.route({
                method: 'GET',
                path: '/users',
                auth: false,
                responses: {
                    200: {
                        body: z.object({
                            id: z.string(),
                        }),
                        cache: {
                            scope: 'private',
                            maxAge: 300,
                            vary: ['authorization'],
                        },
                    },
                    404: ProblemDetailsSchema,
                },
            }),
            getUser: k.route({
                method: 'GET',
                path: '/users/:id',
                responses: {
                    200: z.object({
                        id: z.string(),
                    }),
                    404: {
                        body: ProblemDetailsSchema,
                        cache: {
                            scope: 'public',
                            maxAge: 10,
                        },
                    },
                },
            }),
            health: k.route({
                method: 'GET',
                path: '/health',
                responses: {
                    200: {
                        body: z.object({
                            ok: z.boolean(),
                        }),
                        cache: 'no-store',
                    },
                },
            }),
            taggedUser: k.route({
                method: 'GET',
                path: '/tagged-users/:id',
                responses: {
                    200: {
                        body: z.object({
                            id: z.string(),
                        }),
                        cache: {
                            scope: 'private',
                            noCache: true,
                        },
                        etag: true,
                    },
                },
            }),
        }),
    }).api;
    const spec = generateJson(cachedContract, baseConfig);

    it('documents Cache-Control and Vary on the response that declares them', () => {
        const response = spec.paths['/users']?.get?.responses['200'];
        expect(Object.keys(response?.headers ?? {})).toEqual(['Cache-Control', 'Vary']);
        expect(response?.headers?.['Cache-Control']?.schema).toEqual({
            type: 'string',
            example: 'private, max-age=300',
        });
        expect(response?.headers?.['Vary']?.schema).toEqual({
            type: 'string',
            example: 'authorization',
        });
    });

    it('documents nothing on a sibling response that declares no policy', () => {
        expect(spec.paths['/users']?.get?.responses['404']?.headers).toBeUndefined();
    });

    it('documents a policy declared on an error response', () => {
        const response = spec.paths['/users/{id}']?.get?.responses['404'];
        expect(Object.keys(response?.headers ?? {})).toEqual(['Cache-Control']);
        expect(response?.headers?.['Cache-Control']?.schema).toEqual({
            type: 'string',
            example: 'public, max-age=10',
        });
        expect(spec.paths['/users/{id}']?.get?.responses['200']?.headers).toBeUndefined();
    });

    it('documents an ETag on a response that declares one', () => {
        const response = spec.paths['/tagged-users/{id}']?.get?.responses['200'];
        expect(Object.keys(response?.headers ?? {})).toEqual(['Cache-Control', 'ETag']);
        expect(response?.headers?.['ETag']?.schema).toEqual({ type: 'string' });
    });

    it('documents a no-store policy', () => {
        const response = spec.paths['/health']?.get?.responses['200'];
        expect(Object.keys(response?.headers ?? {})).toEqual(['Cache-Control']);
        expect(response?.headers?.['Cache-Control']?.schema).toEqual({
            type: 'string',
            example: 'no-store',
        });
    });

    it('documents no cache headers on a route with no policy', () => {
        const plain = generateJson(
            defineConfig({
                ...config,
                routes: k.routes('api', {
                    getUser: k.route({
                        method: 'GET',
                        path: '/users/:id',
                        responses: {
                            200: z.object({
                                id: z.string(),
                            }),
                        },
                    }),
                }),
            }).api,
            baseConfig
        );
        expect(plain.paths['/users/{id}']?.get?.responses['200']?.headers).toBeUndefined();
    });

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });
});

describe('error response media type (RFC 9457)', () => {
    const contractWithErrorsRoutes = k.routes('api', {
        getUser: k.route({
            method: 'GET',
            path: '/users/{id}',
            params: z.object({ id: z.string() }),
            responses: {
                200: z.object({ id: z.string() }),
                404: z.object({
                    type: z.string(),
                    title: z.string(),
                    status: z.number().int(),
                    detail: z.string(),
                }),
                500: z.object({
                    type: z.string(),
                    title: z.string(),
                    status: z.number().int(),
                    detail: z.string(),
                }),
            },
        }),
    });

    const contractWithErrors = defineConfig({
        ...config,
        routes: contractWithErrorsRoutes,
    }).api;
    const spec = generateJson(contractWithErrors, baseConfig);
    const responses = spec.paths['/users/{id}']?.get?.responses;

    it('keeps success responses on application/json', () => {
        expect(responses?.['200']?.content?.['application/json']).toBeDefined();
        expect(responses?.['200']?.content?.['application/problem+json']).toBeUndefined();
    });

    it('emits 4xx responses as application/problem+json', () => {
        expect(responses?.['404']?.content?.['application/problem+json']?.schema).toBeDefined();
        expect(responses?.['404']?.content?.['application/json']).toBeUndefined();
    });

    it('emits 5xx responses as application/problem+json', () => {
        expect(responses?.['500']?.content?.['application/problem+json']?.schema).toBeDefined();
        expect(responses?.['500']?.content?.['application/json']).toBeUndefined();
    });

    it('still applies field-level deprecation to an error response under application/problem+json', () => {
        const errorFieldRoutes = k.routes('api', {
            getUser: k.route({
                method: 'GET',
                path: '/users/{id}',
                responses: {
                    200: z.object({
                        id: z.string(),
                    }),
                    404: z.object({
                        type: z.string(),
                        title: z.string(),
                        status: z.number().int(),
                        detail: z.string().meta({
                            deprecated: true,
                        }),
                    }),
                },
            }),
        });
        const deprecatedSpec = generateJson(
            defineConfig({
                ...config,
                routes: errorFieldRoutes,
            }).api,
            baseConfig
        );
        const errorSchema = deprecatedSpec.paths['/users/{id}']?.get?.responses?.['404']?.content?.['application/problem+json']?.schema as
            | Record<string, Record<string, Record<string, unknown>>>
            | undefined;
        expect(errorSchema?.properties?.['detail']?.deprecated).toBe(true);
    });
});

describe('declared response contentType', () => {
    const contractWithContentTypeRoutes = k.routes('api', {
        exportUsers: k.route({
            method: 'GET',
            path: '/users/export',
            responses: {
                200: {
                    body: z.string(),
                    contentType: 'text/csv',
                },
            },
        }),
        getUser: k.route({
            method: 'GET',
            path: '/users/{id}',
            params: z.object({ id: z.string() }),
            responses: {
                200: {
                    body: z.object({ id: z.string() }),
                },
            },
        }),
    });

    const contractWithContentType = defineConfig({
        ...config,
        routes: contractWithContentTypeRoutes,
    }).api;
    const spec = generateJson(contractWithContentType, baseConfig);

    it('uses the declared media type for the response', () => {
        const response = spec.paths['/users/export']?.get?.responses?.['200'];
        expect(response?.content?.['text/csv']?.schema).toBeDefined();
        expect(response?.content?.['application/json']).toBeUndefined();
    });

    it('defaults to application/json when contentType is omitted on the object form', () => {
        const response = spec.paths['/users/{id}']?.get?.responses?.['200'];
        expect(response?.content?.['application/json']?.schema).toBeDefined();
    });
});

describe('binary response bodies', () => {
    const binaryContractRoutes = k.routes('api', {
        downloadBadge: k.route({
            method: 'GET',
            path: '/badge',
            responses: {
                200: {
                    body: z.instanceof(Uint8Array),
                    contentType: 'application/pdf',
                },
            },
        }),
    });

    const binaryContract = defineConfig({
        ...config,
        routes: binaryContractRoutes,
    }).api;
    const spec = generateJson(binaryContract, baseConfig);

    it('emits type: string, format: binary under the declared media type', () => {
        const schema = spec.paths['/badge']?.get?.responses?.['200']?.content?.['application/pdf']?.schema as
            | Record<string, unknown>
            | undefined;
        expect(schema).toEqual({ type: 'string', format: 'binary' });
    });
});

describe('security from the contract', () => {
    const user = k.identity.bearer({
        context: z.object({
            userId: z.string(),
        }),
        bearerFormat: 'JWT',
    });

    const permissions = Kizuna.permissions({
        workspace: ['read', 'delete'],
    });

    const roles = Kizuna.roles(permissions, {
        admin: {
            workspace: ['read'],
        },
        owner: 'all',
    });

    const member = k.identity.apiKey({
        name: 'x-workspace-token',
        in: 'header',
        context: z.object({
            workspaceUserId: z.string(),
        }),
        roles,
    });

    const partner = k.identity.oauth2({
        flows: {
            clientCredentials: {
                tokenUrl: 'https://auth.example.com/token',
                scopes: {
                    'workspace:read': 'Read the workspace',
                },
            },
        },
        roles,
    });

    const makeSecuredContract = () => {
        const securedKConfig = {
            auth: {
                identities: {
                    user,
                    member,
                    partner,
                },
            },
        };
        const securedK = new Kizuna<{
            auth: {
                identities: {
                    user: typeof user;
                    member: typeof member;
                    partner: typeof partner;
                };
            };
        }>();
        const routes = securedK.routes({
            listUsers: securedK.route({
                method: 'GET',
                path: '/users',
                auth: false,
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            getSecret: securedK.route({
                method: 'GET',
                path: '/secret',
                auth: 'user',
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            deleteWorkspace: securedK.route({
                method: 'DELETE',
                path: '/workspace',
                auth: {
                    identity: 'member',
                    roles: 'owner',
                    requires: {
                        workspace: ['delete'],
                    },
                },
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            scoped: securedK.route({
                method: 'GET',
                path: '/scoped',
                auth: {
                    identity: 'partner',
                    requires: {
                        workspace: ['read'],
                    },
                },
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
        });
        return defineConfig({
            ...securedKConfig,
            routes: {
                api: routes,
            },
        }).api;
    };

    const spec = generateJson(makeSecuredContract(), baseConfig);

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });

    it('emits components.securitySchemes from the contract identities', () => {
        expect(spec.components?.securitySchemes).toEqual({
            user: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
            member: {
                type: 'apiKey',
                name: 'x-workspace-token',
                in: 'header',
            },
            partner: {
                type: 'oauth2',
                flows: {
                    clientCredentials: {
                        tokenUrl: 'https://auth.example.com/token',
                        scopes: {
                            'workspace:read': 'Read the workspace',
                        },
                    },
                },
            },
        });
    });

    it('emits operation.security for an identity-secured route', () => {
        expect(spec.paths['/secret']?.get?.security).toEqual([
            {
                user: [],
            },
        ]);
    });

    it('emits operation.security and x-kizuna-requires for a route with requires', () => {
        expect(spec.paths['/workspace']?.delete?.security).toEqual([
            {
                member: [],
            },
        ]);
        expect(spec.paths['/workspace']?.delete?.['x-kizuna-requires']).toEqual({
            workspace: ['delete'],
        });
    });

    it('emits x-kizuna-roles for a route with roles', () => {
        expect(spec.paths['/workspace']?.delete?.['x-kizuna-roles']).toEqual(['owner']);
    });

    it('leaves x-kizuna-requires and x-kizuna-roles off a route with neither', () => {
        expect(spec.paths['/secret']?.get?.['x-kizuna-requires']).toBeUndefined();
        expect(spec.paths['/secret']?.get?.['x-kizuna-roles']).toBeUndefined();
    });

    it('emits what an OAuth route requires as its scopes', () => {
        expect(spec.paths['/scoped']?.get?.security).toEqual([
            {
                partner: ['workspace:read'],
            },
        ]);
    });

    it('omits security entirely on a public route', () => {
        expect(spec.paths['/users']?.get?.security).toBeUndefined();
    });

    it('documents the 401 and 403 the guard answers with, which no route declared', () => {
        const secret = spec.paths['/secret']?.get?.responses;

        expect(secret?.['401']?.content?.['application/problem+json']).toBeDefined();
        expect(secret?.['401']?.headers?.['www-authenticate']).toBeDefined();
        expect(secret?.['403']?.content?.['application/problem+json']).toBeDefined();
    });

    it('documents no challenge header behind an api key, which is not HTTP authentication', () => {
        const workspace = spec.paths['/workspace']?.delete?.responses;

        expect(workspace?.['401']?.content?.['application/problem+json']).toBeDefined();
        expect(workspace?.['401']?.headers?.['www-authenticate']).toBeUndefined();
    });

    it('keeps a refusal out of every cache', () => {
        const secret = spec.paths['/secret']?.get?.responses;

        expect(secret?.['401']?.headers?.['Cache-Control']).toBeDefined();
        expect(secret?.['403']?.headers?.['Cache-Control']).toBeDefined();
    });

    it('leaves a public route without either', () => {
        const users = spec.paths['/users']?.get?.responses;

        expect(users?.['401']).toBeUndefined();
        expect(users?.['403']).toBeUndefined();
    });

    it('omits securitySchemes when the contract has no identities', () => {
        const plain = defineConfig({
            ...config,
            routes: contractRoutes,
        }).api;
        const plainSpec = generateJson(plain, baseConfig);
        expect(plainSpec.components?.securitySchemes).toBeUndefined();
    });

    it('emits security resolved through a nested cascade', () => {
        const nestedKConfig = {
            auth: {
                identities: {
                    user,
                },
            },
        };
        const nestedK = new Kizuna<{
            auth: {
                identities: {
                    user: typeof user;
                };
            };
        }>();
        const members = nestedK.routes({
            session: {
                login: nestedK.route({
                    method: 'POST',
                    path: '/auth/login',
                    auth: false,
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                }),
                me: nestedK.route({
                    method: 'GET',
                    path: '/auth/me',
                    auth: 'user',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                }),
            },
            events: {
                listEvents: nestedK.route({
                    method: 'GET',
                    path: '/events',
                    auth: 'user',
                    responses: {
                        200: z.object({
                            ok: z.boolean(),
                        }),
                    },
                }),
            },
        });
        const nestedContract = defineConfig({
            ...nestedKConfig,
            routes: {
                members,
            },
        }).api;
        const nestedSpec = generateJson(nestedContract, baseConfig);
        expect(nestedSpec.paths['/auth/login']?.post?.security).toBeUndefined();
        expect(nestedSpec.paths['/auth/me']?.get?.security).toEqual([
            {
                user: [],
            },
        ]);
        expect(nestedSpec.paths['/events']?.get?.security).toEqual([
            {
                user: [],
            },
        ]);
    });
});

describe('shared scheme names', () => {
    it('emits one securitySchemes entry for identities sharing a scheme', () => {
        const admin = k.identity.bearer({
            scheme: 'user',
            context: z.object({
                userId: z.string(),
            }),
        });
        const viewer = k.identity.bearer({
            scheme: 'user',
            context: z.object({
                userId: z.string(),
            }),
        });
        const sharedKConfig = {
            auth: {
                identities: {
                    admin,
                    viewer,
                },
            },
        };
        const sharedK = new Kizuna<{
            auth: {
                identities: {
                    admin: typeof admin;
                    viewer: typeof viewer;
                };
            };
        }>();
        const routes = sharedK.routes({
            updateSettings: sharedK.route({
                method: 'GET',
                path: '/settings/update',
                auth: 'admin',
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            getSettings: sharedK.route({
                method: 'GET',
                path: '/settings',
                auth: 'viewer',
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
        });
        const sharedContract = defineConfig({
            ...sharedKConfig,
            routes: {
                api: routes,
            },
        }).api;
        const spec = generateJson(sharedContract, baseConfig);
        expect(spec.components?.securitySchemes).toEqual({
            user: {
                type: 'http',
                scheme: 'bearer',
            },
        });
        expect(spec.paths['/settings/update']?.get?.security).toEqual([
            {
                user: [],
            },
        ]);
        expect(spec.paths['/settings']?.get?.security).toEqual([
            {
                user: [],
            },
        ]);
    });
});

describe('custom identities (no OpenAPI scheme)', () => {
    const user = k.identity.bearer({
        context: z.object({
            userId: z.string(),
        }),
    });

    const inviteToken = k.identity.custom({
        context: z.object({
            inviteId: z.string(),
        }),
    });

    const makeContract = () => {
        const customKConfig = {
            auth: {
                identities: {
                    user,
                    inviteToken,
                },
            },
        };
        const customK = new Kizuna<{
            auth: {
                identities: {
                    user: typeof user;
                    inviteToken: typeof inviteToken;
                };
            };
        }>();
        const routes = customK.routes({
            getInvite: customK.route({
                method: 'GET',
                path: '/invites/:token',
                auth: 'inviteToken',
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            mixed: customK.route({
                method: 'GET',
                path: '/mixed/:token',
                auth: ['user', 'inviteToken'],
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
            open: customK.route({
                method: 'GET',
                path: '/open',
                auth: false,
                responses: {
                    200: z.object({
                        ok: z.boolean(),
                    }),
                },
            }),
        });
        return defineConfig({
            ...customKConfig,
            routes: {
                api: routes,
            },
        }).api;
    };

    const spec = generateJson(makeContract(), baseConfig);

    it('is a valid OpenAPI 3.1 document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });

    it('emits no securityScheme for a custom identity', () => {
        expect(spec.components?.securitySchemes).toEqual({
            user: {
                type: 'http',
                scheme: 'bearer',
            },
        });
    });

    it('marks a custom-only route with x-kizuna-guarded and no security', () => {
        const operation = spec.paths['/invites/{token}']?.get;
        expect(operation?.security).toBeUndefined();
        expect(operation?.['x-kizuna-guarded']).toEqual(['inviteToken']);
    });

    it('emits security for the describable scheme and x-kizuna-guarded for the custom one', () => {
        const operation = spec.paths['/mixed/{token}']?.get;
        expect(operation?.security).toEqual([
            {
                user: [],
            },
        ]);
        expect(operation?.['x-kizuna-guarded']).toEqual(['inviteToken']);
    });

    it('leaves a public route without security or x-kizuna-guarded', () => {
        const operation = spec.paths['/open']?.get;
        expect(operation?.security).toBeUndefined();
        expect(operation?.['x-kizuna-guarded']).toBeUndefined();
    });
});

describe('streams', () => {
    const streamRoutes = k.routes('api', {
        reply: k.route({
            method: 'POST',
            path: '/reply',
            body: z.object({
                prompt: z.string(),
            }),
            responses: {
                200: {
                    stream: {
                        delta: z.object({
                            text: z.string(),
                        }),
                        done: z.object({
                            count: z.int(),
                        }),
                    },
                },
                400: ProblemDetailsSchema,
            },
        }),
        ticks: k.route({
            method: 'GET',
            path: '/ticks',
            responses: {
                200: {
                    stream: z.object({
                        tick: z.int(),
                    }),
                },
            },
        }),
        lines: k.route({
            method: 'GET',
            path: '/lines',
            responses: {
                200: {
                    stream: z.string(),
                    contentType: 'text/plain',
                },
            },
        }),
    });
    const streamContract = defineConfig({
        ...config,
        routes: streamRoutes,
    }).api;
    const spec = generateJson(streamContract, {
        info: {
            title: 'Streams',
            version: '1.0.0',
        },
    });

    it('documents named events under text/event-stream as a oneOf of messages', () => {
        const response = spec.paths['/reply']!.post!.responses['200'] as { content: Record<string, { schema: Record<string, unknown> }> };
        const schema = response.content['text/event-stream']!.schema;
        expect(schema).toEqual({
            oneOf: [
                {
                    type: 'object',
                    required: ['event', 'data'],
                    properties: {
                        event: { const: 'delta' },
                        data: {
                            type: 'object',
                            properties: {
                                text: { type: 'string' },
                            },
                            required: ['text'],
                            additionalProperties: false,
                        },
                        id: { type: 'string' },
                        retry: { type: 'integer' },
                    },
                },
                {
                    type: 'object',
                    required: ['event', 'data'],
                    properties: {
                        event: { const: 'done' },
                        data: {
                            type: 'object',
                            properties: {
                                count: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 },
                            },
                            required: ['count'],
                            additionalProperties: false,
                        },
                        id: { type: 'string' },
                        retry: { type: 'integer' },
                    },
                },
            ],
        });
    });

    it('documents an unnamed stream as one message and a text stream as a string', () => {
        const ticks = spec.paths['/ticks']!.get!.responses['200'] as { content: Record<string, { schema: Record<string, unknown> }> };
        expect(ticks.content['text/event-stream']!.schema).toMatchObject({
            type: 'object',
            required: ['data'],
        });
        const lines = spec.paths['/lines']!.get!.responses['200'] as { content: Record<string, { schema: Record<string, unknown> }> };
        expect(lines.content['text/plain']!.schema).toEqual({ type: 'string' });
    });

    it('is a valid OpenAPI document', async () => {
        await expect(spec).toBeAValidOpenAPIDefinition();
    });
});

describe('routes carrying handlers', () => {
    it('documents the route without its handler', () => {
        const contract = defineConfig({
            ...config,
            routes: k.routes({
                users: {
                    getUser: k
                        .route({
                            method: 'GET',
                            path: '/users/:id',
                            responses: {
                                200: z.object({
                                    id: z.string(),
                                }),
                            },
                        })
                        .handler(({ params }) => ({
                            status: 200,
                            body: {
                                id: params.id,
                            },
                        })),
                },
            }),
        }).api;

        const spec = generateJson(contract, baseConfig);

        expect(spec.paths['/users/{id}']!.get).toHaveProperty('responses');
        expect(JSON.stringify(spec)).not.toContain('handler');
    });
});
