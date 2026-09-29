import { expectTypeOf, test } from 'vitest';
import { KizunaTanstackQuery } from './proxy.js';
import { createClient } from './generated/client.js';

const apiClient = createClient({
    baseUrl: 'http://localhost:8000',
});

const api = new KizunaTanstackQuery(apiClient);

test('a route with a required argument demands input', () => {
    // @ts-expect-error getUser requires `params`
    api.users.getUser.queryOptions({});
});

test('a route with a required query demands input', () => {
    // @ts-expect-error searchUsers declares a required `term`
    api.users.searchUsers.queryOptions({});
});

test('path params are typed', () => {
    // @ts-expect-error `id` is a string, not a number
    api.users.getUser.queryOptions({ input: { params: { id: 1 } } });
});

test('a route with a query schema carries the validation 400 in its data', () => {
    const options = api.users.searchUsers.queryOptions({
        input: {
            query: {
                term: 'ada',
            },
        },
    });
    type Data = Awaited<ReturnType<Exclude<typeof options.queryFn, symbol>>>;
    expectTypeOf<Data['status']>().toEqualTypeOf<200 | 400>();
});

test('a mutation route has no query factories', () => {
    expectTypeOf(api.users.createUser).not.toHaveProperty('queryOptions');
    expectTypeOf(api.users.listUsers).not.toHaveProperty('mutationOptions');
});

test('groups and routes both expose a partial key', () => {
    expectTypeOf(api.users.key()).toEqualTypeOf<readonly [readonly string[]]>();
    expectTypeOf(api.users.getUser.key()).toEqualTypeOf<readonly [readonly string[]]>();
});

test('a streamed route offers streamOptions with the messages as data, and no query or mutation factories', () => {
    const options = api.assistant.reply.streamOptions({
        input: {
            body: {
                prompt: 'hi',
            },
        },
        refetchMode: 'append',
    });
    type Data = Awaited<ReturnType<Exclude<typeof options.queryFn, symbol>>>;
    expectTypeOf<Data[number]['event']>().toEqualTypeOf<'delta' | 'done'>();
    expectTypeOf<Data[number]['data']>().toEqualTypeOf<{ text: string } | { count: number }>();
    expectTypeOf<Data[number]['id']>().toEqualTypeOf<string | undefined>();
    expectTypeOf(api.assistant.reply).not.toHaveProperty('queryOptions');
    expectTypeOf(api.assistant.reply).not.toHaveProperty('mutationOptions');
});
