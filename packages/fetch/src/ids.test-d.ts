import { expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import { createClient, type API } from './generated/api.js';
import { CenterId, UserId } from './generated/api-ids.js';

const client = createClient({
    baseUrl: 'https://example.com',
});

test("an id the ids file parses is the client's brand of the same name", () => {
    expectTypeOf<z.output<typeof CenterId>>().toEqualTypeOf<API.CenterId>();
    expectTypeOf<z.output<typeof UserId>>().toEqualTypeOf<API.UserId>();
});

test('one brand is never another', () => {
    expectTypeOf<z.output<typeof UserId>>().not.toExtend<API.CenterId>();
});

test('a parsed id passes where the client takes one', () => {
    void client.centers.getCenter({
        params: {
            centerId: CenterId.parse('center_1'),
        },
    });
});

test('a plain string still does not', () => {
    void client.centers.getCenter({
        params: {
            // @ts-expect-error a plain string carries no brand
            centerId: 'center_1',
        },
    });
});
