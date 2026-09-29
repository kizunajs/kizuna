import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readMetaBrand, readScalarRules, satisfiesScalarRules } from './generator.js';
import { Kizuna } from './kizuna.js';

describe('Kizuna.brand', () => {
    it('records the brand in the metadata', () => {
        const UserId = Kizuna.brand('UserId', z.string());
        expect(readMetaBrand(UserId)).toBe('UserId');
    });

    it('keeps the brand through a description', () => {
        const UserId = Kizuna.brand('UserId', z.string()).describe('The user this belongs to');
        expect(readMetaBrand(UserId)).toBe('UserId');
    });

    it('validates as the schema it brands', () => {
        const UserId = Kizuna.brand('UserId', z.string().min(1));
        expect(UserId.safeParse('usr_123').success).toBe(true);
        expect(UserId.safeParse('').success).toBe(false);
    });
});

describe('Kizuna.brand on something other than a scalar', () => {
    it('throws on an enum', () => {
        expect(() => Kizuna.brand('Kind', z.enum(['email', 'sms']))).toThrow(
            "Kizuna.brand('Kind') takes a string, number, bigint, boolean or date schema, not `enum`."
        );
    });

    it('throws on a transform', () => {
        expect(() =>
            Kizuna.brand(
                'Length',
                z.string().transform((value) => value.length)
            )
        ).toThrow('not `pipe`');
    });

    it('accepts a string format and an integer', () => {
        expect(readMetaBrand(Kizuna.brand('UserId', z.uuid()))).toBe('UserId');
        expect(readMetaBrand(Kizuna.brand('Year', z.int()))).toBe('Year');
    });
});

describe('readScalarRules', () => {
    it('reads a regex with its case flag, and string length', () => {
        expect(
            readScalarRules(
                z
                    .string()
                    .regex(/^inv_[a-z0-9]+$/i)
                    .min(6)
                    .max(20)
            )
        ).toEqual({
            patterns: [
                {
                    source: '^inv_[a-z0-9]+$',
                    ignoreCase: true,
                },
            ],
            minLength: 6,
            maxLength: 20,
            integer: false,
        });
    });

    it('reads a number range and leaves out the safe-integer bounds of z.int()', () => {
        expect(readScalarRules(z.int().max(500))).toEqual({
            patterns: [],
            integer: true,
            minimum: undefined,
            maximum: 500,
            exclusiveMinimum: undefined,
            exclusiveMaximum: undefined,
        });
    });

    it('reads nothing from a schema with no checks', () => {
        expect(readScalarRules(z.string())).toBeUndefined();
    });

    it('leaves out a regex whose flags no client can run', () => {
        expect(readScalarRules(z.string().regex(/^a/s))).toBeUndefined();
    });

    it('agrees with the server on which values pass', () => {
        const schema = z
            .string()
            .regex(/^inv_[a-z0-9]+$/i)
            .max(12);
        const rules = readScalarRules(schema)!;
        for (const value of ['inv_abc', 'INV_ABC', 'usr_abc', 'inv_abcdefghijk']) {
            expect(satisfiesScalarRules(value, rules)).toBe(schema.safeParse(value).success);
        }
    });
});
