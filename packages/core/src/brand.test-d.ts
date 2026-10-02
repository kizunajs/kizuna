import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from './kizuna.js';
import type { KizunaBrand } from './brand.js';

test('Kizuna.brand types the output with the brand a generated client declares', () => {
    const UserId = Kizuna.brand('UserId', z.string());
    expectTypeOf<z.output<typeof UserId>>().toEqualTypeOf<string & KizunaBrand<'UserId'>>();
});

test('Kizuna.brand leaves the input unbranded', () => {
    const UserId = Kizuna.brand('UserId', z.string());
    expectTypeOf<z.input<typeof UserId>>().toEqualTypeOf<string>();
});

test('a plain string is not a branded value', () => {
    const UserId = Kizuna.brand('UserId', z.string());
    expectTypeOf<string>().not.toMatchTypeOf<z.output<typeof UserId>>();
});

test('an object cannot be branded', () => {
    Kizuna.brand(
        'User',
        // @ts-expect-error a brand wraps a scalar
        z.object({
            id: z.string(),
        })
    );
});

test('an optional schema cannot be branded', () => {
    // @ts-expect-error nullability goes on the brand, not inside it
    Kizuna.brand('UserId', z.string().optional());
});
