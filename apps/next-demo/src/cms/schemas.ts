import { z } from 'zod';
import { Kizuna } from 'kizunajs';

/**
 * A product in the shop. Branded, so a page that lists products stores ids
 * the CMS can index and check.
 */
export const ProductId = Kizuna.brand('ProductId', z.string());

/**
 * The limits here are design rules: a heading that fits the hero on one line,
 * a call to action that fits its button.
 */
export const HeadingSchema = z.string().min(1).max(60).describe('Under 8 words.');

export const CtaSchema = z.object({
    label: z.string().min(1).max(24).describe('Two or three words.'),
    href: z.url({
        protocol: /^https$/,
    }),
});

export const SeoSchema = z.object({
    title: z.string().min(1).max(60).describe('What search results show as the title.'),
    description: z.string().max(155).describe('One or two sentences for search results.'),
});
