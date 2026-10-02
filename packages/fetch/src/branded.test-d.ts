import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { createClient, toCenterId, type API } from './generated/api.js';

const client = createClient({
    baseUrl: 'https://example.com',
});

test('the named brand is a string that no plain string passes for', () => {
    expectTypeOf<API.CenterId>().toExtend<string>();
    expectTypeOf<string>().not.toExtend<API.CenterId>();
});

test('the constructor makes the brand from a plain string', () => {
    expectTypeOf(toCenterId('center_1')).toEqualTypeOf<API.CenterId>();
});

test('a branded path param is the named brand', () => {
    expectTypeOf<API.CentersGetCenter.Params['centerId']>().toEqualTypeOf<API.CenterId>();
});

test('a branded field in a response model is the named brand', () => {
    expectTypeOf<API.Center['id']>().toEqualTypeOf<API.CenterId>();
    expectTypeOf<API.Center['parentId']>().toEqualTypeOf<API.CenterId | null>();
});

test('a branded query, body and header field keep the brand', () => {
    expectTypeOf<API.CentersListCenters.Query['parentId']>().toEqualTypeOf<API.CenterId | undefined>();
    expectTypeOf<API.CentersMoveCenter.Body['parentId']>().toEqualTypeOf<API.CenterId>();
    expectTypeOf<API.CentersMoveCenter.Headers['x-actor-center']>().toEqualTypeOf<API.CenterId>();
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
            centerId: toCenterId('center_1'),
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

test('an id the server parsed is the type the client takes, and the other way round', () => {
    const CenterId = Kizuna.brand('CenterId', z.string());
    expectTypeOf<z.output<typeof CenterId>>().toEqualTypeOf<API.CenterId>();
    const OtherId = Kizuna.brand('OtherId', z.string());
    expectTypeOf<z.output<typeof OtherId>>().not.toExtend<API.CenterId>();
});
