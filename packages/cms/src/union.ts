import type { z } from 'zod';
import { readDef } from 'kizunajs/generator';

/**
 * The option of a union a value belongs to: the one whose `_type` literal
 * matches, as Portable Text blocks carry, or else the first the value passes.
 */
export const optionOf = (options: readonly z.core.$ZodType[], value: unknown): z.core.$ZodType | undefined => {
    if (typeof value === 'object' && value !== null && '_type' in value) {
        const kind = (value as { _type: unknown })._type;
        const tagged = options.find((option) => {
            const discriminator = readDef(option).shape?.['_type'];
            return discriminator !== undefined && (readDef(discriminator).values ?? []).includes(kind);
        });
        if (tagged !== undefined) return tagged;
    }
    return options.find((option) => (option as z.ZodType).safeParse(value).success);
};
