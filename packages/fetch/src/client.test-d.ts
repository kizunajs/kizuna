import { expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import type { ProblemDetails, ValidationError } from 'kizunajs';
import type { MissingRelationSchema } from './api.fixture.js';
import { createClient, toUserId, type API } from './generated/api.js';
import {
    createClient as createRequiredContextClient,
    type RequestContext as RequiredRequestContext,
} from './generated/required-context.js';
import { createClient as createSecuredClient } from './generated/secured.js';

const client = createClient({
    baseUrl: 'http://localhost:3000',
});

test('route with body: z.void() does not require a body argument', async () => {
    await client.items.deleteItem({
        params: {
            id: '1',
        },
    });
});

test('route with body: z.void() rejects a non-void body', () => {
    void client.items.deleteItem({
        params: {
            id: '1',
        },
        // @ts-expect-error body should not accept an object
        body: {
            foo: 'bar',
        },
    });
});

test('client exposes one function per route', () => {
    expectTypeOf(client.users).toHaveProperty('getUser');
    expectTypeOf(client.users).toHaveProperty('createUser');
    expectTypeOf(client.users).toHaveProperty('listUsers');
});

test('getUser requires params with the right shape', async () => {
    const result = await client.users.getUser({
        params: {
            id: '1',
        },
    });
    if (result.status === 200) {
        expectTypeOf(result.body).toEqualTypeOf<{ id: string; name: string }>();
        expectTypeOf(result.headers).toEqualTypeOf<{ 'x-request-id'?: string | undefined }>();
    } else if (result.status === 404) {
        expectTypeOf(result.body).toEqualTypeOf<ProblemDetails>();
        expectTypeOf(result.headers).toEqualTypeOf<Record<string, string>>();
    }
});

test('createUser requires body with the right shape', async () => {
    const result = await client.users.createUser({
        body: {
            name: 'Alice',
            email: 'alice@test.com',
        },
    });
    if (result.status === 201) {
        expectTypeOf(result.body).toEqualTypeOf<{ id: string; name: string; email: string }>();
    }
});

test('listUsers can be called without args when all query fields are optional', async () => {
    const result = await client.users.listUsers();
    if (result.status === 200) {
        expectTypeOf(result.body).toEqualTypeOf<{ users: string[] }>();
    }
});

test('listUsers also accepts explicit query', async () => {
    const result = await client.users.listUsers({
        query: {
            page: 1,
        },
    });
    if (result.status === 200) {
        expectTypeOf(result.body).toEqualTypeOf<{ users: string[] }>();
    }
});

test('optional headers can be omitted', async () => {
    await client.headers.optional();
    await client.headers.optional({
        headers: {
            'accept-language': 'nb',
        },
    });
});

test('a required header must be present in the headers passed', () => {
    expectTypeOf<API.HeadersRequired.Headers>().toEqualTypeOf<{ 'x-tenant': string }>();
    void client.headers.required({
        // @ts-expect-error x-tenant is required
        headers: {},
    });
    void client.headers.required({
        headers: {
            'x-tenant': 'acme',
        },
    });
});

test('a route with a required header cannot be called without headers', () => {
    // @ts-expect-error headers is required
    void client.headers.required();
});

test('a route with a required query field cannot be called without a query', () => {
    // @ts-expect-error query is required
    void client.payloads.typedQuery();
});

test('rejects wrong param shape', () => {
    void client.users.getUser({
        params: {
            // @ts-expect-error wrong param key
            userId: '1',
        },
    });
});

test('rejects wrong body shape', () => {
    void client.users.createUser({
        // @ts-expect-error missing email
        body: {
            name: 'Alice',
        },
    });
});

test('rejects extra body field', () => {
    void client.users.createUser({
        body: {
            name: 'A',
            email: 'a@b.com',
            // @ts-expect-error extra `extra` key
            extra: true,
        },
    });
});

test('rejects body on a route that does not accept one', () => {
    void client.users.getUser({
        params: {
            id: '1',
        },
        // @ts-expect-error getUser has no body schema
        body: {
            foo: 'bar',
        },
    });
});

test('query fields surface as the JSON wire types the server coerces from', async () => {
    await client.payloads.typedQuery({
        query: {
            search: 'hello',
            transformed: 'world',
            page: 1,
            from: '2026-01-01T00:00:00.000Z',
            cursor: '1',
        },
    });
    type Query = API.PayloadsTypedQuery.Query;
    expectTypeOf<Query['page']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Query['from']>().toEqualTypeOf<string>();
    expectTypeOf<Query['cursor']>().toEqualTypeOf<string>();
    expectTypeOf<Query['search']>().toEqualTypeOf<string>();
    expectTypeOf<Query['transformed']>().toEqualTypeOf<string>();
});

test('nested object, array, and date fields surface as their JSON wire types', async () => {
    await client.payloads.nestedTyped({
        body: {
            filters: {
                price: 99,
                createdAt: '2026-01-01T00:00:00.000Z',
                tags: [
                    {
                        weight: 1,
                        name: 'a',
                    },
                ],
            },
            scores: [1, 2, 3],
            pair: [1, 'two'],
        },
    });
    type Body = API.PayloadsNestedTyped.Body;
    expectTypeOf<Body['filters']['price']>().toEqualTypeOf<number>();
    expectTypeOf<Body['filters']['createdAt']>().toEqualTypeOf<string>();
    expectTypeOf<Body['filters']['tags'][number]['weight']>().toEqualTypeOf<number>();
    expectTypeOf<Body['filters']['tags'][number]['name']>().toEqualTypeOf<string>();
    expectTypeOf<Body['scores']>().toEqualTypeOf<number[]>();
    expectTypeOf<Body['pair']>().toEqualTypeOf<[number, string]>();
});

test('nested number field rejects wrong-typed values', () => {
    void client.payloads.nestedTyped({
        body: {
            filters: {
                // @ts-expect-error price must be a number
                price: '99',
                createdAt: '2026-01-01T00:00:00.000Z',
                tags: [],
            },
            scores: [],
            pair: [1, 'x'],
        },
    });
});

test('number inside a discriminated union inside an array resolves per branch per element', async () => {
    await client.payloads.arrayOfDiscriminatedTyped({
        body: {
            events: [
                {
                    kind: 'view',
                    viewedAt: 1700000000000,
                },
                {
                    kind: 'purchase',
                    amount: 99,
                    currency: 'USD',
                },
            ],
        },
    });
    type Event = API.PayloadsArrayOfDiscriminatedTyped.Body['events'][number];
    type ViewEvent = Extract<Event, { kind: 'view' }>;
    type PurchaseEvent = Extract<Event, { kind: 'purchase' }>;
    expectTypeOf<ViewEvent['viewedAt']>().toEqualTypeOf<number>();
    expectTypeOf<PurchaseEvent['amount']>().toEqualTypeOf<number>();
    expectTypeOf<PurchaseEvent['currency']>().toEqualTypeOf<string>();
});

test('number inside a discriminated union inside an array rejects wrong-typed branch values', () => {
    void client.payloads.arrayOfDiscriminatedTyped({
        body: {
            events: [
                {
                    kind: 'purchase',
                    // @ts-expect-error amount must be a number
                    amount: '99',
                    currency: 'USD',
                },
            ],
        },
    });
});

test('number inside a discriminated union nested in an object resolves per branch', async () => {
    await client.payloads.nestedDiscriminatedTyped({
        body: {
            wrapper: {
                strategy: {
                    kind: 'linear',
                    slope: 0.5,
                },
            },
        },
    });
    type Strategy = API.PayloadsNestedDiscriminatedTyped.Body['wrapper']['strategy'];
    type LinearBranch = Extract<Strategy, { kind: 'linear' }>;
    type ExponentialBranch = Extract<Strategy, { kind: 'exponential' }>;
    expectTypeOf<LinearBranch['slope']>().toEqualTypeOf<number>();
    expectTypeOf<ExponentialBranch['base']>().toEqualTypeOf<number>();
});

test('number inside a discriminated union resolves per branch', async () => {
    await client.payloads.discriminatedTyped({
        body: {
            kind: 'count',
            count: 7,
        },
    });
    await client.payloads.discriminatedTyped({
        body: {
            kind: 'name',
            name: 'alice',
        },
    });
    type Body = API.PayloadsDiscriminatedTyped.Body;
    type CountBranch = Extract<Body, { kind: 'count' }>;
    type NameBranch = Extract<Body, { kind: 'name' }>;
    expectTypeOf<CountBranch['count']>().toEqualTypeOf<number>();
    expectTypeOf<NameBranch['name']>().toEqualTypeOf<string>();
});

test('number query field rejects values of the wrong type', () => {
    void client.payloads.typedQuery({
        query: {
            search: 'hello',
            transformed: 'world',
            from: '2026-01-01T00:00:00.000Z',
            cursor: '1',
            // @ts-expect-error page must be a number, not a string
            page: '1',
        },
    });
});

test('nested client exposes sub-router namespaces', () => {
    expectTypeOf(client).toHaveProperty('users');
    expectTypeOf(client).toHaveProperty('posts');
});

test('nested client sub-router exposes its own route functions', () => {
    expectTypeOf(client.users).toHaveProperty('getUser');
    expectTypeOf(client.users).toHaveProperty('createUser');
    expectTypeOf(client.posts).toHaveProperty('listPosts');
});

test('nested route response type narrows correctly by status', async () => {
    const result = await client.users.getUser({
        params: {
            id: '1',
        },
    });
    if (result.status === 200) {
        expectTypeOf(result.body).toEqualTypeOf<{ id: string; name: string }>();
    } else if (result.status === 404) {
        expectTypeOf(result.body).toEqualTypeOf<ProblemDetails>();
    }
});

test('nested route body arg has the correct shape', async () => {
    const result = await client.users.createUser({
        body: {
            name: 'Alice',
            email: 'alice@test.com',
        },
    });
    if (result.status === 201) {
        expectTypeOf(result.body).toEqualTypeOf<{ id: string; name: string; email: string }>();
    }
});

test('nested route rejects wrong param key', () => {
    void client.users.getUser({
        params: {
            // @ts-expect-error wrong param key
            userId: '1',
        },
    });
});

test('nested route rejects body on a route that has none', () => {
    void client.posts.listPosts({
        // @ts-expect-error listPosts has no body schema
        body: {
            foo: 'bar',
        },
    });
});

test('route with body includes ValidationError as a possible 400 response', async () => {
    const result = await client.users.createUser({
        body: {
            name: 'Alice',
            email: 'alice@test.com',
        },
    });
    if (result.status === 400) {
        expectTypeOf(result.body).toEqualTypeOf<API.ValidationError>();
        expectTypeOf(result.body).toExtend<ValidationError>();
    }
});

test('route with query includes ValidationError as a possible 400 response', async () => {
    const result = await client.users.listUsers();
    if (result.status === 400) {
        expectTypeOf(result.body).toEqualTypeOf<API.ValidationError>();
        expectTypeOf(result.body).toExtend<ValidationError>();
    }
});

test('route without body or query does not include ValidationError', async () => {
    const result = await client.users.getUser({
        params: {
            id: '1',
        },
    });
    expectTypeOf(result.status).toEqualTypeOf<200 | 404>();
});

test('pathParams schema types client params by its declared brand', async () => {
    await client.events.getUserEvents({
        params: {
            userId: toUserId('user-1'),
            eventId: 'event-1',
        },
    });
    expectTypeOf<API.EventsGetUserEvents.Params>().toEqualTypeOf<{
        userId: API.UserId;
        eventId: string;
    }>();
    expectTypeOf<API.UserId>().toExtend<string>();
});

test('pathParams schema rejects a plain string for a branded param', () => {
    void client.events.getUserEvents({
        params: {
            // @ts-expect-error plain string is not a UserId
            userId: 'user-1',
            eventId: 'event-1',
        },
    });
});

test('a numeric pathParam surfaces as a number on the client', async () => {
    await client.events.listEventsByYear({
        params: {
            year: 2026,
        },
    });
    expectTypeOf<API.EventsListEventsByYear.Params>().toEqualTypeOf<{ year: number }>();
});

test('a numeric pathParam rejects a string', () => {
    void client.events.listEventsByYear({
        params: {
            // @ts-expect-error year must be a number
            year: '2026',
        },
    });
});

test('routes without a pathParams schema keep template-derived params', () => {
    expectTypeOf<API.UsersGetUser.Params>().toEqualTypeOf<{ id: string }>();
});

test('requestContext config is optional when every declared header is optional', () => {
    createClient({
        baseUrl: 'https://api.example.com',
    });
    createClient({
        baseUrl: 'https://api.example.com',
        requestContext: {
            'x-session-id': 's1',
        },
    });
    createClient({
        baseUrl: 'https://api.example.com',
        requestContext: {
            // @ts-expect-error unknown context header
            'x-unknown': 'nope',
        },
    });
});

test('requestContext config must carry every required declared header', () => {
    expectTypeOf<RequiredRequestContext>().toEqualTypeOf<{
        'x-session-id'?: string;
        'x-tenant': string;
    }>();
    createRequiredContextClient({
        baseUrl: 'https://api.example.com',
        requestContext: {
            'x-tenant': 't1',
            'x-session-id': 's1',
        },
    });
    createRequiredContextClient({
        baseUrl: 'https://api.example.com',
        // @ts-expect-error x-tenant is required
        requestContext: {
            'x-session-id': 's1',
        },
    });
    // @ts-expect-error requestContext is required
    createRequiredContextClient({
        baseUrl: 'https://api.example.com',
    });
});

test('a union response built from named models is the exact union, not any', async () => {
    const result = await client.activity.getActivity();
    if (result.status === 200) {
        expectTypeOf(result.body).toEqualTypeOf<{ kind: 'started'; at: string } | { kind: 'done'; ok: boolean }>();
    }
});

test('a streamed status hands back an async iterable of typed messages', () => {
    void (async () => {
        const result = await client.streams.reply({
            body: {
                prompt: 'hi',
            },
        });
        if (result.status === 200) {
            for await (const message of result.body) {
                if (message.event === 'delta') expectTypeOf(message.data).toEqualTypeOf<{ text: string }>();
                if (message.event === 'done') expectTypeOf(message.data).toEqualTypeOf<{ count: number }>();
                expectTypeOf(message.id).toEqualTypeOf<string | undefined>();
            }
        }
        if (result.status === 404) expectTypeOf(result.body.detail).toEqualTypeOf<string>();

        const lines = await client.streams.lines();
        if (lines.status === 200) expectTypeOf(lines.body).toEqualTypeOf<AsyncIterable<string>>();
    })();
});

test('a guarded route answers with the 401 and 403 its guard sends, undeclared', async () => {
    const response = await client.account.whoAmI();

    expectTypeOf(response.status).toEqualTypeOf<200 | 401 | 403>();

    if (response.status === 401) {
        expectTypeOf(response.body).toEqualTypeOf<API.ProblemDetails>();
        expectTypeOf(response.body).toEqualTypeOf<ProblemDetails>();
        expectTypeOf(response.headers).toEqualTypeOf<{ 'www-authenticate': string }>();
    }
});

test('a route declaring its own 403 carries both bodies for that status', async () => {
    const response = await client.account.declaresIts403();

    expectTypeOf(response.status).toEqualTypeOf<200 | 401 | 403>();

    if (response.status === 403) {
        expectTypeOf(response.body).toEqualTypeOf<z.infer<typeof MissingRelationSchema> | ProblemDetails>();
    }
});

test('a public route gains neither', async () => {
    const response = await client.status.health();

    expectTypeOf(response.status).toEqualTypeOf<200>();
});

const securedClient = createSecuredClient({
    baseUrl: 'http://localhost',
});

test('a refusal carries the body the contract declared under guardSchema', async () => {
    const response = await securedClient.account.whoAmI();

    if (response.status === 401) {
        expectTypeOf(response.body.code).toEqualTypeOf<'expired_token' | 'forbidden' | undefined>();
    }
});
