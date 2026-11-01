import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { croppedImage } from '@kizunajs/cms/schemas';
import { ArticleId } from './ids';
import { BodyTextSchema, bodyAsRichText } from './text-blocks';

/**
 * Hagen's journal. Every site draws on the same articles, and each article
 * picks the sites that show it.
 */
export const Articles = defineCollection({
    name: 'articles',
    id: ArticleId,
    group: 'Journal',
    chooseSites: true,
    preview: {
        url: ({ item }) => `/journal/${item.id}`,
    },
    instructions: `- The summary is one sentence that says what the reader comes away knowing.
- Keep an article's date and the sites it shows on as they are.`,
    fields: [
        {
            name: 'title',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'summary',
            schema: z.string().min(1).max(280),
        },
        {
            name: 'body',
            schema: BodyTextSchema,
        },
        {
            name: 'date',
            schema: z.iso.date(),
            position: 'sidebar',
        },
        {
            name: 'image',
            schema: croppedImage({
                aspectRatio: '3:2',
            })
                .optional(),
            position: 'sidebar',
        },
    ],
    indexes: ['date'],
    migrate: {
        1: bodyAsRichText,
    },
});
