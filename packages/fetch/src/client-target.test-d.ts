import { expectTypeOf, test } from 'vitest';
import { fetchClient } from './client-target.js';

test('fetchClient takes groups as a list of dotted route keys', () => {
    expectTypeOf(fetchClient).parameter(0).toHaveProperty('groups').toEqualTypeOf<readonly string[] | undefined>();
});

test('fetchClient takes groups only as a list', () => {
    fetchClient({
        output: './client.ts',
        groups: ['content.sites.uk', 'content.globals'],
    });

    fetchClient({
        output: './client.ts',
        // @ts-expect-error a single prefix still goes in a list
        groups: 'content',
    });
});
