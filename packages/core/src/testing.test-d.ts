import { expectTypeOf, test } from 'vitest';
import { accessMatrix, createTestClient, type AccessOutcome } from './testing.js';
import type { ValidationError } from './validation-error.js';
import { config } from './testing.fixture.js';

const api = createTestClient(config);

test('the body narrows on the status', async () => {
    const response = await api.users.getUser({
        params: {
            id: '1',
        },
    });
    if (response.status === 200) {
        expectTypeOf(response.body).toEqualTypeOf<{
            id: string;
            name: string;
        }>();
    }
    if (response.status === 400) {
        expectTypeOf(response.body).toEqualTypeOf<ValidationError>();
    }
    expectTypeOf(response.status).toEqualTypeOf<200 | 400 | 401 | 403 | 404>();
});

test('a date arrives as its ISO string', async () => {
    const response = await api.users.health();
    if (response.status === 200) {
        expectTypeOf(response.body.checkedAt).toEqualTypeOf<string>();
    }
});

test('a route with path parameters needs them', () => {
    // @ts-expect-error params are required
    void api.users.getUser();
    void api.users.getUser({
        params: {
            id: '1',
        },
    });
});

test('the body takes the route schema input', () => {
    void api.users.createUser({
        body: {
            // @ts-expect-error name is a string
            name: 1,
        },
    });
});

test('as() takes a declared identity and what its guard returns', () => {
    // @ts-expect-error no identity named admin
    void api.as('admin', {});
    void api.as('member', {
        workspaceUserId: '1',
        // @ts-expect-error guest is not a declared role
        role: 'guest',
    });
    expectTypeOf(
        api.as('user', {
            userId: '1',
        })
    ).toEqualTypeOf(api);
});

test('overrides take the shape of what they replace', () => {
    createTestClient(config, {
        plugins: {
            email: {
                // @ts-expect-error send takes and returns a string
                send: 1,
            },
        },
    });
    createTestClient(config, {
        jobs: {
            // @ts-expect-error no job named sendGoodbye
            sendGoodbye: {},
        },
    });
});

test('the matrix is keyed by the callers it was given', async () => {
    const matrix = await accessMatrix(config, {
        ada: {
            user: {
                userId: '1',
            },
        },
    });
    expectTypeOf(matrix).toEqualTypeOf<Record<string, Record<'anonymous' | 'ada', AccessOutcome>>>();
});
