import { expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import { API, createClient } from './branded-client.generated.js';
import type { CenterId } from './branded.fixture.js';

type CenterIdValue = z.output<typeof CenterId>;

const client = createClient({
    baseUrl: 'https://example.com',
});

test('the named brand is the type the server parses it to', () => {
    expectTypeOf<API.CenterId>().toEqualTypeOf<CenterIdValue>();
});

test('parse brands a plain string', () => {
    expectTypeOf(API.CenterId.parse('center_1')).toEqualTypeOf<API.CenterId>();
});

test('a branded path param is the type the server parses it to', () => {
    expectTypeOf<API.CentersGetCenter.Params['centerId']>().toEqualTypeOf<CenterIdValue>();
});

test('a branded field in a response model is the type the server parses it to', () => {
    expectTypeOf<API.Center['id']>().toEqualTypeOf<CenterIdValue>();
    expectTypeOf<API.Center['parentId']>().toEqualTypeOf<CenterIdValue | null>();
});

test('a branded query, body and header field keep the brand', () => {
    expectTypeOf<API.CentersListCenters.Query['parentId']>().toEqualTypeOf<CenterIdValue | undefined>();
    expectTypeOf<API.CentersMoveCenter.Body['parentId']>().toEqualTypeOf<CenterIdValue>();
    expectTypeOf<API.CentersMoveCenter.Headers['x-actor-center']>().toEqualTypeOf<CenterIdValue>();
});

test('a plain string is rejected where a branded param is expected', () => {
    void client.centers.getCenter({
        params: {
            // @ts-expect-error a plain string carries no brand
            centerId: 'center_1',
        },
    });
});

test('a branded value from a response passes where a branded param is expected', async () => {
    const result = await client.centers.getCenter({
        params: {
            centerId: API.CenterId.parse('center_1'),
        },
    });
    if (result.status !== 200) return;

    void client.centers.moveCenter({
        params: {
            centerId: result.body.id,
        },
        headers: {
            'x-actor-center': result.body.id,
        },
        body: {
            parentId: result.body.id,
        },
    });
});

test('a check narrows a plain string to the brand', () => {
    const raw: string = 'inv_k7f3q9';
    if (API.InviteCode.isValid(raw)) {
        expectTypeOf(raw).toEqualTypeOf<API.InviteCode>();
    }
});
