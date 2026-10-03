import { z } from 'zod';

/**
 * The lengths search results show in full. Google cuts a title at about 600
 * pixels and a description at about 920, which is near these counts in most
 * fonts.
 */
export const SEO_GOALS = {
    title: {
        min: 30,
        max: 60,
    },
    description: {
        min: 70,
        max: 160,
    },
};

/**
 * What search results show for a page: its title and description. The editor
 * shows it as a search result, with each length measured against what search
 * results show in full.
 *
 * @example
 * ```ts
 * import { SeoSchema } from '@kizunajs/cms/schemas';
 *
 * export default definePage({
 *     name: 'frontPage',
 *     fields: [
 *         {
 *             name: 'seo',
 *             label: 'SEO',
 *             schema: SeoSchema,
 *         },
 *     ],
 * });
 * ```
 */
export const SeoSchema = z
    .object({
        title: z
            .string()
            .min(1)
            .max(70)
            .describe(`What search results show as the title. ${SEO_GOALS.title.min} to ${SEO_GOALS.title.max} characters show in full.`),
        description: z
            .string()
            .max(200)
            .describe(
                `One or two sentences under the title. ${SEO_GOALS.description.min} to ${SEO_GOALS.description.max} characters show in full.`
            ),
    })
    .meta({
        'x-kizuna': 'seo',
        'x-kizuna-goals': SEO_GOALS,
    });

export type SeoValue = z.output<typeof SeoSchema>;

export const isSeoJsonSchema = (schema: Record<string, unknown>): boolean => schema['x-kizuna'] === 'seo';
