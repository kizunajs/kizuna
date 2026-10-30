import { expectTypeOf, test } from 'vitest';
import { defineClient, defineGenerator } from './generator.js';

const routeListClient = defineClient({
    target: 'text',
    generate: ({ groups }) => {
        expectTypeOf(groups).toEqualTypeOf<readonly string[] | undefined>();
        return {
            finalize: () => '',
        };
    },
});

const manifest = defineGenerator({
    generate: () => ({
        finalize: () => '',
    }),
});

test('every client and generator takes groups beside output', () => {
    routeListClient({
        output: './routes.txt',
        groups: ['users'],
    });
    manifest({
        output: './routes.txt',
        groups: ['users'],
    });

    routeListClient({
        output: './routes.txt',
        // @ts-expect-error groups is a list of dotted route keys
        groups: [1],
    });
});
