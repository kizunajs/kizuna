import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationErrorSchema } from './schemas.js';
import { defineAdapter, renderJsonResult, type AdapterRequest, type AdapterResult } from './adapter.js';
import { Kizuna } from './kizuna.js';

interface Config {
    tags: typeof kTags;
}

const k = new Kizuna<Config>();

const kTags = k.tags({
    api: 'API',
});

const contract = k.routes('api', {
    createItem: k.route({
        method: 'POST',
        path: '/items',
        body: z.object({
            name: z.string().min(1, 'Name is required'),
            categoryId: z.string(),
        }),
        responses: {
            201: z.object({
                id: z.string(),
            }),
            409: ValidationErrorSchema,
        },
    }),
});

const postRequest = (readBody: () => unknown): AdapterRequest<null> => ({
    request: null,
    method: 'POST',
    resolution: {
        kind: 'core-match',
        path: '/items',
    },
    query: {},
    headers: {
        'content-type': 'application/json',
    },
    readBody,
});

const run = async (readBody: () => unknown, handler: (args: any) => unknown) => {
    const results: AdapterResult[] = [];
    const adapter = defineAdapter<null, void, Record<string, never>>({
        buildHandlerContext: () => ({}),
        respond: (result) => {
            results.push(result);
        },
    });
    await adapter.handle({
        routes: contract,
        router: {
            createItem: handler,
        } as never,
        request: postRequest(readBody),
        responseContext: {},
    });
    const result = results[0]!;
    return {
        result,
        rendered: renderJsonResult(result as Exclude<AdapterResult, { kind: 'raw-response' }>),
    };
};

const created = () => ({
    status: 201,
    body: {
        id: '1',
    },
});

describe('the 400', () => {
    it("answers a schema failure with the rule's values and message", async () => {
        const { result, rendered } = await run(
            () => ({
                name: '',
                categoryId: 'c1',
            }),
            created
        );
        expect(result.kind).toBe('validation-failed');
        expect(rendered.status).toBe(400);
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Invalid request body',
            errors: [
                {
                    code: 'too_short',
                    path: ['name'],
                    message: 'Name is required',
                    minimum: 1,
                },
            ],
        });
    });

    it('answers a body that is not JSON with one invalid_json issue at the root', async () => {
        const { rendered } = await run(() => {
            throw new SyntaxError('Unexpected token');
        }, created);
        expect(rendered.status).toBe(400);
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Invalid request body',
            errors: [
                {
                    code: 'invalid_json',
                    path: [],
                    message: 'The request body is not valid JSON.',
                },
            ],
        });
    });

    it('answers what a handler raises with throwValidation, params flat on the issue', async () => {
        const { result, rendered } = await run(
            () => ({
                name: 'Widget',
                categoryId: 'missing',
            }),
            ({ throwValidation }) =>
                throwValidation([
                    {
                        code: 'not_found',
                        path: ['categoryId'],
                        message: 'Category does not exist',
                        params: {
                            categoryId: 'missing',
                        },
                    },
                ])
        );
        expect(result.kind).toBe('validation-failed');
        expect((result as Extract<AdapterResult, { kind: 'validation-failed' }>).stage).toBe('handler');
        expect(rendered.status).toBe(400);
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Bad Request',
            status: 400,
            detail: 'Category does not exist',
            errors: [
                {
                    code: 'not_found',
                    path: ['categoryId'],
                    message: 'Category does not exist',
                    categoryId: 'missing',
                },
            ],
        });
    });
});

describe('a declared 409', () => {
    it('carries the same errors shape', async () => {
        const { rendered } = await run(
            () => ({
                name: 'Widget',
                categoryId: 'c1',
            }),
            ({ throwError }) =>
                throwError({
                    status: 409,
                    body: {
                        detail: 'Name already taken',
                        errors: [
                            {
                                code: 'already_exists',
                                path: ['name'],
                                message: 'Name already taken',
                            },
                        ],
                    },
                })
        );
        expect(rendered.status).toBe(409);
        expect(rendered.body).toEqual({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            detail: 'Name already taken',
            errors: [
                {
                    code: 'already_exists',
                    path: ['name'],
                    message: 'Name already taken',
                },
            ],
        });
    });
});
