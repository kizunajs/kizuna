import { z } from 'zod';
import { Kizuna } from 'kizunajs';

/**
 * The limits here are design rules: a heading that fits its band on two
 * lines, a link label that fits its button.
 */
export const HeadingSchema = z.string().min(1).max(60).describe('Under 8 words. Wrap a word in *asterisks* to set it in italics.');

/**
 * A sentence set large, like the line under the front page's photo.
 */
export const StatementSchema = z
    .string()
    .min(1)
    .max(140)
    .describe('One or two sentences. Wrap the words to lean on in *asterisks* to set them in italics.');

/**
 * The small label above a heading.
 */
export const EyebrowSchema = z.string().max(40).describe('Two or three words, shown small above the heading.');

/**
 * A button or a menu entry: a page on this site, or an https address.
 */
export const LinkSchema = Kizuna.model({
    title: 'Link',
    schema: z.object({
        label: z.string().min(1).max(24).describe('Two or three words.'),
        href: z
            .string()
            .regex(/^(?:\/(?!\/)|https:\/\/)/)
            .describe('A page on this site, like /blog, or an https address.'),
    }),
});

/**
 * Which green a band is set in.
 */
export const ToneSchema = z.enum(['forest', 'sage']);

/**
 * What editors see for each tone.
 */
export const tones = {
    forest: 'Forest: deep green, light text',
    sage: 'Sage: pale green, dark text',
};
