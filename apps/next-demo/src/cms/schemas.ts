import { z } from 'zod';

/**
 * The limits here are design rules: a heading that fits the hero on one line,
 * a link label that fits its button.
 */
export const HeadingSchema = z.string().min(1).max(60).describe('Under 8 words.');

/**
 * A button or a menu entry: a page on this site, or an https address.
 */
export const LinkSchema = z.object({
    label: z.string().min(1).max(24).describe('Two or three words.'),
    href: z
        .string()
        .regex(/^(?:\/(?!\/)|https:\/\/)/)
        .describe('A page on this site, like /blog, or an https address.'),
});
