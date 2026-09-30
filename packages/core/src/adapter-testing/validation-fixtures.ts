import { z } from 'zod';
import { formatValidationError, validateRequest, type RawInputs } from '../handler-pipeline.js';
import type { RouteDefinition } from '../types.js';
import type { ValidationIssue } from '../validation-error.js';

/**
 * One request the server refuses, or accepts, for the clients to agree with.
 * The server is the oracle: {@link expectedValidation} runs the request
 * through the pipeline, and every generated `check` has to produce the same
 * issues, `message` aside.
 */
export interface ValidationFixture {
    key: string;
    route: RouteDefinition;
    /**
     * The request as it arrives: path, query and header values as strings, the
     * body as parsed JSON or, for a form, as a record of strings.
     */
    input: RawInputs;
}

/**
 * The 400 the server answers a fixture with, or `undefined` when the request
 * passes.
 */
export interface ExpectedValidation {
    detail: string;
    errors: ValidationIssue<string>[];
}

const route = (definition: Omit<RouteDefinition, 'responses'> & Partial<Pick<RouteDefinition, 'responses'>>): RouteDefinition =>
    ({
        responses: {
            200: z.object({
                ok: z.boolean(),
            }),
        },
        ...definition,
    }) as RouteDefinition;

const request = (input: Partial<RawInputs>): RawInputs => ({
    params: {},
    query: {},
    headers: {},
    body: undefined,
    ...input,
});

const EveryRuleSchema = z.object({
    name: z.string().min(1, 'Name is required').max(80),
    mail: z.email('Enter a valid mail address'),
    postalCode: z.string().regex(/^\d{4}$/, 'Four digits'),
    age: z.int().gte(18),
    price: z.number().gt(0).lt(1000).multipleOf(0.5),
    role: z.enum(['admin', 'member']),
    tags: z.array(z.string().min(1)).min(1).max(5),
    newsletter: z.boolean(),
    address: z.strictObject({
        zip: z.string().length(4),
    }),
});

export const VALIDATION_FIXTURES: ValidationFixture[] = [
    {
        key: 'coerced-param-too-small',
        route: route({
            method: 'GET',
            path: '/users/:id',
            pathParams: z.object({
                id: z.int().gte(1),
            }),
        }),
        input: request({
            params: {
                id: '0',
            },
        }),
    },
    {
        key: 'coerced-query-invalid-type',
        route: route({
            method: 'GET',
            path: '/users',
            query: z.object({
                page: z.int(),
                limit: z.int().lte(100).optional(),
            }),
        }),
        input: request({
            query: {
                page: 'x',
                limit: '500',
            },
        }),
    },
    {
        key: 'header-required',
        route: route({
            method: 'GET',
            path: '/users',
            headers: z.object({
                'x-trace': z.string(),
            }),
        }),
        input: request({}),
    },
    {
        key: 'body-nested-and-indexed',
        route: route({
            method: 'POST',
            path: '/orders',
            body: z.object({
                address: z.object({
                    zip: z.string().length(4),
                }),
                members: z
                    .array(
                        z.object({
                            email: z.email(),
                        })
                    )
                    .min(1),
            }),
        }),
        input: request({
            body: {
                address: {
                    zip: '12',
                },
                members: [
                    {
                        email: 'ok@example.com',
                    },
                    {
                        email: 'nope',
                    },
                ],
            },
        }),
    },
    {
        key: 'body-every-rule',
        route: route({
            method: 'POST',
            path: '/contact',
            body: EveryRuleSchema,
        }),
        input: request({
            body: {
                name: '',
                mail: 'nope',
                postalCode: 'ab',
                age: 17,
                price: 0.3,
                role: 'guest',
                tags: [],
                address: {
                    zip: '12',
                    extra: true,
                },
            },
        }),
    },
    {
        key: 'body-wrong-types',
        route: route({
            method: 'POST',
            path: '/contact',
            body: EveryRuleSchema,
        }),
        input: request({
            body: {
                name: 1,
                mail: true,
                postalCode: null,
                age: '17',
                price: '1',
                role: 2,
                tags: 'a',
                newsletter: 'yes',
                address: [],
            },
        }),
    },
    {
        key: 'urlencoded-body-coerced',
        route: route({
            method: 'POST',
            path: '/signup',
            contentType: 'application/x-www-form-urlencoded',
            body: z.object({
                age: z.int().gte(18),
                newsletter: z.boolean(),
            }),
        }),
        input: request({
            body: {
                age: '17',
                newsletter: 'maybe',
            },
        }),
    },
    {
        key: 'first-failing-stage-only',
        route: route({
            method: 'POST',
            path: '/users',
            query: z.object({
                dryRun: z.boolean(),
            }),
            body: z.object({
                name: z.string().min(1),
            }),
        }),
        input: request({
            query: {
                dryRun: 'sometimes',
            },
            body: {
                name: '',
            },
        }),
    },
    {
        key: 'valid-request',
        route: route({
            method: 'POST',
            path: '/contact',
            query: z.object({
                dryRun: z.boolean().optional(),
            }),
            body: EveryRuleSchema,
        }),
        input: request({
            query: {
                dryRun: 'true',
            },
            body: {
                name: 'Ada',
                mail: 'ada@example.com',
                postalCode: '4016',
                age: 36,
                price: 9.5,
                role: 'admin',
                tags: ['one'],
                newsletter: false,
                address: {
                    zip: '4016',
                },
            },
        }),
    },
];

/**
 * What the server answers a fixture with.
 */
export const expectedValidation = (fixture: ValidationFixture): ExpectedValidation | undefined => {
    const result = validateRequest(fixture.route, fixture.input);
    if (result.ok) return undefined;
    const formatted = formatValidationError(result.error);
    return {
        detail: formatted.detail,
        errors: formatted.issues,
    };
};

/**
 * The issues with `message` dropped, for comparing a client's `check` with
 * the server: a client repeats a rule's static message but not kizuna's
 * defaults word for word.
 */
export const withoutMessages = (errors: ValidationIssue<string>[]): Array<Omit<ValidationIssue<string>, 'message'>> =>
    errors.map(({ message: _message, ...issue }) => issue);
