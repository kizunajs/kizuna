import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { croppedImage } from '@kizunajs/cms/schemas';
import { ArticleId } from './ids';

/**
 * Hagen's journal. Every site draws on the same articles, and each article
 * picks the sites that show it.
 */
export const Articles = defineCollection({
    name: 'articles',
    id: ArticleId,
    group: 'Journal',
    chooseSites: true,
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
            schema: z.string().min(1).max(4000),
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
                .optional()
                .describe('Shown where the article is linked, like a card in the newsletter.'),
            position: 'sidebar',
        },
    ],
    indexes: ['date'],
});
