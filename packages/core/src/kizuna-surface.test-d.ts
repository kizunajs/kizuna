import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';

interface Config {
    tags: typeof kTags;
    validation: {
        issueCodes: 'invalid_phone_number';
    };
}

const k = new Kizuna<Config>();

const kTags = k.tags({ users: { title: 'Users' } });

test('issueCodes literal is preserved, not widened to string', () => {
    const schema = z.string().superRefine((value, ctx) => {
        k.issue(ctx, { code: 'invalid_phone_number', message: 'nope', input: value });
        // @ts-expect-error 'not_registered' is not a declared issue code
        k.issue(ctx, { code: 'not_registered', message: 'nope', input: value });
        // built-in Zod codes stay allowed
        k.issue(ctx, { code: 'custom', message: 'nope', input: value });
    });
    expectTypeOf(schema).toExtend<z.ZodType>();
});

test('tag names are checked against the declared tags', () => {
    k.routes('users', {});
    // @ts-expect-error 'userz' is not a declared tag
    k.routes('userz', {});
});
