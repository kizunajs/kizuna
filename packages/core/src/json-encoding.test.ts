import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { encodeForWire } from './json-encoding.js';
import { Kizuna } from './kizuna.js';

const wireSchema = (schema: z.ZodType) =>
    z.toJSONSchema(schema, {
        unrepresentable: 'any',
        io: 'input',
        override: encodeForWire,
    });

describe('encodeForWire', () => {
    it('gives a date its ISO string form', () => {
        expect(wireSchema(z.date())).toMatchObject({
            type: 'string',
            format: 'date-time',
        });
    });

    it('keeps the wire form when the date carries a description or a brand', () => {
        expect(wireSchema(z.date().describe('When the sale ends.'))).toMatchObject({
            type: 'string',
            format: 'date-time',
            description: 'When the sale ends.',
        });
        expect(wireSchema(Kizuna.brand('SaleEnd', z.date()))).toMatchObject({
            type: 'string',
            format: 'date-time',
        });
    });

    it('gives a bigint a string, apart from a date', () => {
        expect(wireSchema(z.bigint().describe('Stock left.'))).toMatchObject({
            type: 'string',
        });
        expect(wireSchema(z.bigint())).not.toHaveProperty('format');
    });
});
