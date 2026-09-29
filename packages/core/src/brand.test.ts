import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { readMetaBrand } from './generator.js';
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
