import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProblemDetailsSchema } from './schemas.js';
import {
    defineAdapter,
    entriesToObject,
    extractCredential,
    parseBodyText,
    parseFetchBody,
    renderJsonResult,
    ResponseValidationError,
    type AdapterRequest,
    type AdapterResult,
} from './adapter.js';
import type { RouteDefinition, Routes } from './types.js';
import type { SecurityScheme } from './security-scheme.js';
import { Kizuna } from './kizuna.js';
import { createIdentity } from './identity.js';
import { defineConfig } from './define-config.js';

interface Config {
    groups: typeof kGroups;
}

const k = new Kizuna<Config>();

const kGroups = k.groups({
    api: 'API',
});

const contract = k.routes({
    getItem: k.route({
        method: 'GET',
        path: '/items/:id',
        responses: {
            200: z.object({
                id: z.string(),
                name: z.string(),
            }),
            404: ProblemDetailsSchema,
        },
    }),
});

const makeRequest = (path: string): AdapterRequest<null> => ({
    request: null,
    method: 'GET',
    resolution: {
        kind: 'core-match',
        path,
    },
    query: {},
    headers: {},
    readBody: () => undefined,
});

const makeAdapter = () => {
    const results: AdapterResult[] = [];
    const adapter = defineAdapter<null, void, Record<string, never>>({
        buildHandlerContext: () => ({}),
        respond: (result) => {
            results.push(result);
        },
    });
    return { adapter, results };
};

describe('responseValidation', () => {
    it('passes through when handler returns a body matching the response schema', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract,
            router: {
                getItem: ({ params }: { params: { id: string } }) => ({
                    status: 200,
                    body: {
                        id: params.id,
                        name: 'Widget',
                    },
                }),
            },
            request: makeRequest('/items/1'),
            responseContext: {},
            responseValidation: true,
        });
        expect(results[0]?.kind).toBe('success');
    });

    it('produces a handler-error when handler returns a body that fails the response schema', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract,
            router: {
                getItem: () =>
                    ({
                        status: 200,
                        body: { id: 123 },
                    }) as any,
            },
            request: makeRequest('/items/1'),
            responseContext: {},
            responseValidation: true,
        });
        expect(results[0]?.kind).toBe('handler-error');
        const result = results[0] as Extract<AdapterResult, { kind: 'handler-error' }>;
        expect(result.error).toBeInstanceOf(ResponseValidationError);
        const error = result.error as ResponseValidationError;
        expect(error.routeKey).toBe('getItem');
        expect(error.status).toBe(200);
        expect(error.issues.length).toBeGreaterThan(0);
    });

    it('does not validate when responseValidation is false', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract,
            router: {
                getItem: () =>
                    ({
                        status: 200,
                        body: { id: 123 },
                    }) as any,
            },
            request: makeRequest('/items/1'),
            responseContext: {},
            responseValidation: false,
        });
        expect(results[0]?.kind).toBe('success');
    });

    it('does not validate when responseValidation is omitted', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract,
            router: {
                getItem: () =>
                    ({
                        status: 200,
                        body: { id: 123 },
                    }) as any,
            },
            request: makeRequest('/items/1'),
            responseContext: {},
        });
        expect(results[0]?.kind).toBe('success');
    });

    it('validates a 404 handler body against the auto-filled Problem Details envelope', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract,
            router: {
                // The handler supplies only `detail`; `type`/`title`/`status` are auto-filled
                // before validation, so this passes despite ProblemDetailsSchema requiring all four.
                getItem: () => ({
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                }),
            },
            request: makeRequest('/items/missing'),
            responseContext: {},
            responseValidation: true,
        });
        expect(results[0]?.kind).toBe('success');
    });

    it('throwError() helper throws and adapter returns it as a response', async () => {
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: contract,
            router: {
                getItem: ({ throwError }) => {
                    return throwError({
                        status: 404,
                        body: {
                            detail: 'Not found',
                        },
                    });
                },
            },
            request: makeRequest('/items/1'),
            responseContext: {},
        });
        expect(results[0]?.kind).toBe('success');
        const result = results[0] as Extract<AdapterResult, { kind: 'success' }>;
        expect(result.status).toBe(404);
        expect(result.body).toEqual({
            detail: 'Not found',
        });
    });

    it('passes non-ResponseError to onError as before', async () => {
        const errors: unknown[] = [];
        const adapter = defineAdapter<null, void, Record<string, never>>({
            buildHandlerContext: () => ({}),
            respond: () => {},
            onError: async (error) => {
                errors.push(error);
            },
        });
        await adapter.handle({
            routes: contract,
            router: {
                getItem: () => {
                    throw new Error('something broke');
                },
            },
            request: makeRequest('/items/1'),
            responseContext: {},
        });
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(Error);
        expect((errors[0] as Error).message).toBe('something broke');
    });
});

describe('renderJsonResult: error formatting', () => {
    it('emits RFC 9457 Problem Details as application/problem+json by default', () => {
        const rendered = renderJsonResult({
            kind: 'success',
            routeKey: 'getItem',
            route: contract.getItem,
            status: 404,
            body: {
                detail: 'Not found',
            },
            headers: {},
        });
        expect(rendered.status).toBe(404);
        expect(rendered.headers['content-type']).toBe('application/problem+json');
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'Not found',
        });
    });

    it('carries extension members through onto the problem body', () => {
        const rendered = renderJsonResult({
            kind: 'success',
            routeKey: 'getItem',
            route: contract.getItem,
            status: 409,
            body: {
                detail: 'Conflict',
                conflictingId: 'item_1',
            },
            headers: {},
        });
        expect(rendered.body).toMatchObject({
            status: 409,
            detail: 'Conflict',
            conflictingId: 'item_1',
        });
    });

    it('routes errors through a custom formatError: legacy shape + content-type', () => {
        // A team migrating onto kizuna keeps its old wire shape for clients that cannot
        // move yet; the canonical Problem Details object is reshaped, not bypassed.
        const rendered = renderJsonResult(
            {
                kind: 'not-found',
            },
            (problem) => ({
                contentType: 'application/json',
                body: {
                    ok: false,
                    error: {
                        code: problem.status,
                        message: problem.detail,
                    },
                },
            })
        );
        expect(rendered.status).toBe(404);
        expect(rendered.headers['content-type']).toBe('application/json');
        expect(rendered.body).toEqual({
            ok: false,
            error: {
                code: 404,
                message: 'Not Found',
            },
        });
    });

    it('does not reshape success responses', () => {
        const rendered = renderJsonResult(
            {
                kind: 'success',
                routeKey: 'getItem',
                route: contract.getItem,
                status: 200,
                body: {
                    id: '1',
                    name: 'Item',
                },
                headers: {},
            },
            () => ({
                contentType: 'application/json',
                body: 'should-not-be-used',
            })
        );
        expect(rendered.headers['content-type']).toBe('application/json');
        expect(rendered.body).toEqual({
            id: '1',
            name: 'Item',
        });
    });
});

describe('eachRoute', () => {
    it('yields static routes before parameterized routes at the same path segment', () => {
        const c = k.routes({
            getById: k.route({
                method: 'GET',
                path: '/items/:id',
                responses: { 200: z.object({ id: z.string() }) },
            }),
            getMine: k.route({
                method: 'GET',
                path: '/items/mine',
                responses: { 200: z.object({ id: z.string() }) },
            }),
        });

        const { adapter } = makeAdapter();
        const router = {
            getById: async () => ({ status: 200 as const, body: { id: '1' } }),
            getMine: async () => ({ status: 200 as const, body: { id: 'me' } }),
        };

        const keys = [...adapter.eachRoute(c, router)].map((r) => r.routeKey);
        expect(keys).toEqual(['getMine', 'getById']);
    });
});

describe('renderJsonResult: non-JSON and binary bodies', () => {
    const rawContract = k.routes({
        exportCsv: k.route({
            method: 'GET',
            path: '/export',
            responses: {
                200: {
                    body: z.string(),
                    contentType: 'text/csv',
                },
            },
        }),
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

    it('sends a string body raw under the declared content type', () => {
        const rendered = renderJsonResult({
            kind: 'success',
            routeKey: 'exportCsv',
            route: rawContract.exportCsv,
            status: 200,
            body: 'id,name\n1,Ada',
            headers: {},
        });
        expect(rendered.raw).toBe(true);
        expect(rendered.headers['content-type']).toBe('text/csv');
        expect(rendered.body).toBe('id,name\n1,Ada');
    });

    it('sends a binary body raw, defaulting BinarySchema content type', () => {
        const rendered = renderJsonResult({
            kind: 'success',
            routeKey: 'downloadBadge',
            route: rawContract.downloadBadge,
            status: 200,
            body: Buffer.from([1, 2, 3]),
            headers: {},
        });
        expect(rendered.raw).toBe(true);
        expect(rendered.headers['content-type']).toBe('application/pdf');
        expect(rendered.body).toBeInstanceOf(Uint8Array);
    });

    it('throws a clear error when a raw route returns a non-string, non-binary body', () => {
        expect(() =>
            renderJsonResult({
                kind: 'success',
                routeKey: 'exportCsv',
                route: rawContract.exportCsv,
                status: 200,
                body: {
                    rows: [],
                },
                headers: {},
            })
        ).toThrow(/must be a string or Uint8Array/);
    });
});

describe('urlencoded bodies', () => {
    const formRoute = {
        contentType: 'application/x-www-form-urlencoded',
    } as RouteDefinition;

    it('collects a repeated key into a list when parsing text', () => {
        expect(parseBodyText('tags=work&tags=urgent&title=Plan', formRoute)).toEqual({
            tags: ['work', 'urgent'],
            title: 'Plan',
        });
    });

    it('collects a repeated key into a list when parsing a request', async () => {
        const request = new Request('http://localhost/notes', {
            method: 'POST',
            body: 'tags=work&tags=urgent&title=Plan',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
            },
        });
        expect(await parseFetchBody(request, formRoute)).toEqual({
            tags: ['work', 'urgent'],
            title: 'Plan',
        });
    });
});

describe('entriesToObject', () => {
    it('keeps a key named after an Object.prototype member as a plain value', () => {
        const parsed = entriesToObject(new URLSearchParams('constructor=a&toString=b&hasOwnProperty=c'));
        expect(parsed).toEqual({
            constructor: 'a',
            toString: 'b',
            hasOwnProperty: 'c',
        });
    });

    it('collects a repeated prototype-named key into a list of its own values', () => {
        expect(entriesToObject(new URLSearchParams('constructor=a&constructor=b'))).toEqual({
            constructor: ['a', 'b'],
        });
    });

    it('drops __proto__, leaving the prototype alone', () => {
        const parsed = entriesToObject(new URLSearchParams('__proto__=x&__proto__=y&term=ada'));
        expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
        expect(Object.keys(parsed)).toEqual(['term']);
    });
});

describe('extractCredential: cookies', () => {
    const session = createIdentity.apiKey({
        name: 'session',
        in: 'cookie',
    });
    const withCookie = (cookie: string): AdapterRequest<null> => ({
        ...makeRequest('/'),
        headers: {
            cookie,
        },
    });

    it('keeps a value that is not valid percent-encoding as sent', () => {
        expect(extractCredential(session, withCookie('_ga=%E0%A4%A; session=sess_ada'))).toEqual({
            apiKey: {
                in: 'cookie',
                name: 'session',
                value: 'sess_ada',
            },
        });
        expect(extractCredential(session, withCookie('session=%E0%A4%A'))).toEqual({
            apiKey: {
                in: 'cookie',
                name: 'session',
                value: '%E0%A4%A',
            },
        });
    });

    it('still decodes a valid percent-encoded value', () => {
        expect(extractCredential(session, withCookie('session=sess%20ada'))).toEqual({
            apiKey: {
                in: 'cookie',
                name: 'session',
                value: 'sess ada',
            },
        });
    });

    it('reads the first of two cookies with one name', () => {
        expect(extractCredential(session, withCookie('session=sess_ada; session=sess_tossed'))).toEqual({
            apiKey: {
                in: 'cookie',
                name: 'session',
                value: 'sess_ada',
            },
        });
    });

    it('finds no credential under a name only Object.prototype carries', () => {
        const constructorCookie = createIdentity.apiKey({
            name: 'constructor',
            in: 'cookie',
        });
        expect(extractCredential(constructorCookie, withCookie('other=1'))).toEqual({
            apiKey: null,
        });
        expect(extractCredential(session, withCookie('__proto__=x; constructor=y'))).toEqual({
            apiKey: null,
        });
    });
});

describe('undeclared response fields', () => {
    const send = async (
        responses: RouteDefinition['responses'],
        handler: (args: { throwError: (response: { status: number; body: unknown }) => never }) => unknown,
        responseValidation?: boolean
    ) => {
        const { adapter, results } = makeAdapter();
        const route = {
            method: 'GET',
            path: '/items',
            responses,
        } as RouteDefinition;
        await adapter.handle({
            routes: {
                getItem: route,
            },
            router: {
                getItem: handler,
            } as never,
            request: makeRequest('/items'),
            responseContext: {},
            responseValidation,
        });
        const result = results[0]!;
        if (result.kind === 'raw-response') throw new Error('Expected a rendered result.');
        const rendered = renderJsonResult(result);
        return {
            result,
            rendered,
            text: rendered.body === undefined ? '' : JSON.stringify(rendered.body),
        };
    };

    const answer =
        (body: unknown, status = 200) =>
        () => ({
            status,
            body,
        });

    it('strips them at the top level, inside nested objects, and on every array item', async () => {
        const { text } = await send(
            {
                200: z.object({
                    id: z.string(),
                    profile: z.object({
                        bio: z.string(),
                    }),
                    friends: z.array(
                        z.object({
                            id: z.string(),
                        })
                    ),
                }),
            },
            answer({
                id: '1',
                passwordHash: 'argon2id-hash',
                profile: {
                    bio: 'Mathematician',
                    apiKey: 'sk_live_ada',
                },
                friends: [
                    {
                        id: '2',
                        email: 'grace@example.com',
                    },
                ],
            })
        );
        expect(text).toBe('{"id":"1","profile":{"bio":"Mathematician"},"friends":[{"id":"2"}]}');
    });

    it('strips them whether or not responseValidation is on', async () => {
        for (const responseValidation of [false, true]) {
            const { result, text } = await send(
                {
                    200: z.object({
                        id: z.string(),
                    }),
                },
                answer({
                    id: '1',
                    passwordHash: 'argon2id-hash',
                }),
                responseValidation
            );
            expect(result.kind).toBe('success');
            expect(text).toBe('{"id":"1"}');
        }
    });

    it('keeps the order the handler wrote the declared fields in', async () => {
        const { text } = await send(
            {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
            },
            answer({
                name: 'Ada',
                secret: 'x',
                id: '1',
            })
        );
        expect(text).toBe('{"name":"Ada","id":"1"}');
    });

    it('sends a date, a transformed field and a defaulted field as the handler returned them', async () => {
        const { text } = await send(
            {
                200: z.object({
                    createdAt: z.date(),
                    name: z.string().transform((name) => name.toUpperCase()),
                    role: z.string().default('member'),
                    tags: z.array(z.string()).optional(),
                }),
            },
            answer({
                createdAt: new Date('2026-03-01T09:30:00.000Z'),
                name: 'Ada',
                token: 'secret',
            })
        );
        expect(text).toBe('{"createdAt":"2026-03-01T09:30:00.000Z","name":"Ada"}');
    });

    it('keeps the extra keys z.looseObject, .catchall() and z.record declare', async () => {
        const { text } = await send(
            {
                200: z.object({
                    loose: z.looseObject({
                        id: z.string(),
                    }),
                    labelled: z
                        .object({
                            id: z.string(),
                        })
                        .catchall(
                            z.object({
                                label: z.string(),
                            })
                        ),
                    byLocale: z.record(
                        z.string(),
                        z.object({
                            title: z.string(),
                        })
                    ),
                }),
            },
            answer({
                loose: {
                    id: '1',
                    extra: 'kept',
                },
                labelled: {
                    id: '1',
                    primary: {
                        label: 'Primary',
                        secret: 'dropped',
                    },
                },
                byLocale: {
                    nb: {
                        title: 'Forside',
                        draftNotes: 'dropped',
                    },
                },
            })
        );
        expect(JSON.parse(text)).toEqual({
            loose: {
                id: '1',
                extra: 'kept',
            },
            labelled: {
                id: '1',
                primary: {
                    label: 'Primary',
                },
            },
            byLocale: {
                nb: {
                    title: 'Forside',
                },
            },
        });
    });

    it('keeps every field of the union option that declares them all, whatever the order', async () => {
        const Summary = z.object({
            id: z.string(),
        });
        const Detail = z.object({
            id: z.string(),
            name: z.string(),
        });
        const { text } = await send(
            {
                200: z.union([Summary, Detail]),
            },
            answer({
                id: '1',
                name: 'Ada',
                passwordHash: 'argon2id-hash',
            })
        );
        expect(text).toBe('{"id":"1","name":"Ada"}');

        const { text: summaryText } = await send(
            {
                200: z.union([Detail, Summary]),
            },
            answer({
                id: '1',
                passwordHash: 'argon2id-hash',
            })
        );
        expect(summaryText).toBe('{"id":"1"}');
    });

    it('strips a discriminated union by the arm its discriminator picks', async () => {
        const { text } = await send(
            {
                200: z.discriminatedUnion('kind', [
                    z.object({
                        kind: z.literal('article'),
                        title: z.string(),
                    }),
                    z.object({
                        kind: z.literal('employee'),
                        name: z.string(),
                    }),
                ]),
            },
            answer({
                kind: 'employee',
                name: 'Ada',
                title: 'not declared on this arm',
            })
        );
        expect(text).toBe('{"kind":"employee","name":"Ada"}');
    });

    it('keeps the fields either side of an intersection declares', async () => {
        const { text } = await send(
            {
                200: z.intersection(
                    z.object({
                        id: z.string(),
                    }),
                    z.object({
                        name: z.string(),
                    })
                ),
            },
            answer({
                id: '1',
                name: 'Ada',
                passwordHash: 'argon2id-hash',
            })
        );
        expect(text).toBe('{"id":"1","name":"Ada"}');
    });

    it('sends a body failing its schema without its undeclared fields when responseValidation is off', async () => {
        const { result, text } = await send(
            {
                200: z.object({
                    id: z.string(),
                }),
            },
            answer({
                id: 1,
                passwordHash: 'argon2id-hash',
            })
        );
        expect(result.kind).toBe('success');
        expect(text).toBe('{"id":1}');
    });

    it('drops the keys a z.strictObject refuses when responseValidation is off', async () => {
        const { result, text } = await send(
            {
                200: z.strictObject({
                    id: z.string(),
                }),
            },
            answer({
                id: '1',
                passwordHash: 'argon2id-hash',
            })
        );
        expect(result.kind).toBe('success');
        expect(text).toBe('{"id":"1"}');
    });

    it('keeps only the keys some option declares when no union option accepts the body', async () => {
        const { result, text } = await send(
            {
                200: z.union([
                    z.object({
                        kind: z.literal('article'),
                        title: z.string(),
                    }),
                    z.object({
                        kind: z.literal('employee'),
                        name: z.string(),
                    }),
                ]),
            },
            answer({
                kind: 'contractor',
                name: 'Ada',
                passwordHash: 'argon2id-hash',
            })
        );
        expect(result.kind).toBe('success');
        expect(text).toBe('{"kind":"contractor","name":"Ada"}');
    });

    it('drops the undeclared extension members of an error body failing its schema', async () => {
        const { rendered } = await send(
            {
                409: ProblemDetailsSchema.extend({
                    conflictingId: z.string(),
                }),
            },
            answer(
                {
                    detail: 'Already taken',
                    conflictingId: 7,
                    internalQuery: 'SELECT * FROM users',
                },
                409
            )
        );
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: 'Already taken',
            conflictingId: 7,
        });
    });

    it('answers 500 for a body failing its schema when responseValidation is on', async () => {
        const { result, rendered } = await send(
            {
                200: z.object({
                    id: z.string(),
                }),
            },
            answer({
                id: 1,
                passwordHash: 'argon2id-hash',
            }),
            true
        );
        expect(result.kind).toBe('handler-error');
        expect(rendered.status).toBe(500);
        expect(JSON.stringify(rendered.body)).not.toContain('argon2id-hash');
    });

    it('leaves a status the route does not declare as returned', async () => {
        const { text } = await send(
            {
                200: z.object({
                    id: z.string(),
                }),
            },
            answer(
                {
                    id: '1',
                    note: 'kept',
                },
                202
            )
        );
        expect(text).toBe('{"id":"1","note":"kept"}');
    });

    it('keeps the extension members an error schema declares, from a return and from throwError', async () => {
        const ConflictSchema = ProblemDetailsSchema.extend({
            conflictingId: z.string(),
        });
        const conflict = {
            detail: 'Already taken',
            conflictingId: '7',
            internalQuery: 'SELECT * FROM users',
        };
        const returned = await send(
            {
                409: ConflictSchema,
            },
            answer(conflict, 409)
        );
        const thrown = await send(
            {
                409: ConflictSchema,
            },
            ({ throwError }) =>
                throwError({
                    status: 409,
                    body: conflict,
                })
        );
        for (const { result, rendered } of [returned, thrown]) {
            expect((result as Extract<AdapterResult, { kind: 'success' }>).body).toEqual({
                detail: 'Already taken',
                conflictingId: '7',
            });
            expect(rendered.body).toEqual({
                type: 'about:blank',
                title: 'Conflict',
                status: 409,
                detail: 'Already taken',
                conflictingId: '7',
            });
        }
    });

    it('keeps a problem type the handler set and the schema declares', async () => {
        const { rendered } = await send(
            {
                404: ProblemDetailsSchema,
            },
            answer(
                {
                    type: 'https://example.com/problems/missing-user',
                    detail: 'No such user',
                    lookedUpBy: 'admin@example.com',
                },
                404
            )
        );
        expect(rendered.body).toEqual({
            type: 'https://example.com/problems/missing-user',
            title: 'Not Found',
            status: 404,
            detail: 'No such user',
        });
    });

    it('keeps the problem instance whatever the error schema declares', async () => {
        const { rendered } = await send(
            {
                404: ProblemDetailsSchema,
            },
            answer(
                {
                    detail: 'No such order',
                    instance: '/orders/42',
                    lookedUpBy: 'admin@example.com',
                },
                404
            )
        );
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Not Found',
            status: 404,
            detail: 'No such order',
            instance: '/orders/42',
        });
    });

    it('answers 500 when stripping a thrown error body throws, and never sends it', async () => {
        const { result, rendered } = await send(
            {
                409: ProblemDetailsSchema.extend({
                    conflict: z.string(),
                }),
            },
            ({ throwError }) =>
                throwError({
                    status: 409,
                    body: {
                        detail: 'Already taken',
                        conflict: {
                            toJSON: () => {
                                throw new Error('cannot serialise');
                            },
                        },
                        internalQuery: 'SELECT * FROM users',
                    },
                })
        );
        expect(result.kind).toBe('handler-error');
        expect(rendered.status).toBe(500);
        expect(JSON.stringify(rendered.body)).not.toContain('internalQuery');
    });

    it('answers 500 for a body too deep to strip, and never sends it', async () => {
        interface Comment {
            text: string;
            replies: Comment[];
        }
        const CommentSchema: z.ZodType<Comment> = z.lazy(() =>
            z.object({
                text: z.string(),
                replies: z.array(CommentSchema),
            })
        );
        let thread: Record<string, unknown> = {
            text: 'leaf',
            replies: [],
            passwordHash: 'argon2id-hash',
        };
        for (let depth = 0; depth < 20000; depth += 1) {
            thread = {
                text: 'reply',
                replies: [thread],
            };
        }
        const { result, rendered } = await send(
            {
                200: CommentSchema,
            },
            answer(thread)
        );
        expect(result.kind).toBe('handler-error');
        expect(rendered.status).toBe(500);
    });

    it('sends the same entity tag for the same declared fields, whatever else the handler returned', async () => {
        const tagged = (secret: string) =>
            send(
                {
                    200: {
                        body: z.object({
                            id: z.string(),
                        }),
                        etag: true,
                    },
                },
                answer({
                    id: '1',
                    secret,
                })
            );
        const first = await tagged('one');
        const second = await tagged('two');
        expect(first.rendered.headers['etag']).toBeDefined();
        expect(first.rendered.headers['etag']).toBe(second.rendered.headers['etag']);
    });
});

describe('undeclared fields on a guard denial', () => {
    const user = createIdentity.bearer({});
    const GuardSchema = ProblemDetailsSchema.extend({
        code: z.string().optional(),
    });
    const refusal = {
        detail: 'No access',
        code: 'invoice_locked',
        tokenFingerprint: 'fp_secret',
    };

    const deny = async (status: 401 | 403, declared?: z.ZodType) => {
        const api = defineConfig({
            auth: {
                identities: {
                    user,
                },
                guardSchema: GuardSchema,
            },
            routes: [
                {
                    getInvoice: {
                        method: 'GET',
                        path: '/invoices',
                        auth: 'user',
                        responses: {
                            200: z.object({
                                ok: z.boolean(),
                            }),
                            ...(declared
                                ? {
                                      403: declared,
                                  }
                                : {}),
                        },
                    },
                },
            ],
        } as never).api as unknown as {
            routes: Routes;
            securitySchemes: Record<string, SecurityScheme>;
        };
        const { adapter, results } = makeAdapter();
        await adapter.handle({
            routes: api.routes,
            router: {
                getInvoice: () => ({
                    status: 200,
                    body: {
                        ok: true,
                    },
                }),
            } as never,
            request: makeRequest('/invoices'),
            responseContext: {},
            guards: {
                user: ({ deny: refuse }) =>
                    refuse({
                        status,
                        body: refusal,
                    }),
            },
            schemes: api.securitySchemes,
        });
        const result = results[0]!;
        if (result.kind === 'raw-response') throw new Error('Expected a rendered result.');
        return renderJsonResult(result).body;
    };

    it('keeps what the guard schema declares and drops the rest', async () => {
        expect(await deny(401)).toEqual({
            type: 'about:blank',
            title: 'Unauthorized',
            status: 401,
            detail: 'No access',
            code: 'invoice_locked',
        });
    });

    it('keeps the guard schema extensions on a 403 the route also declares', async () => {
        expect(await deny(403, ProblemDetailsSchema)).toEqual({
            type: 'about:blank',
            title: 'Forbidden',
            status: 403,
            detail: 'No access',
            code: 'invoice_locked',
        });
    });
});
