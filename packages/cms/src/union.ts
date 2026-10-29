import type { z } from 'zod';
import { readDef } from 'kizunajs/generator';

/**
 * The option of a union a value belongs to: the one whose literal under the
 * union's discriminator matches, like a block list's `block` or a Portable
 * Text block's `_type`, or else the first the value passes. Matching by the
 * literal finds the option of an item still being filled in, which passes
 * none of them yet.
 */
export const optionOf = (
    union: {
        options?: readonly z.core.$ZodType[];
        discriminator?: string;
    },
    value: unknown
): z.core.$ZodType | undefined => {
    const options = union.options ?? [];
    const key = union.discriminator ?? '_type';
    if (typeof value === 'object' && value !== null && key in value) {
        const kind = (value as Record<string, unknown>)[key];
        const tagged = options.find((option) => {
            const literal = readDef(option).shape?.[key];
            return literal !== undefined && (readDef(literal).values ?? []).includes(kind);
        });
        if (tagged !== undefined) return tagged;
    }
    return options.find((option) => (option as z.ZodType).safeParse(value).success);
};
