import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
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
    ],
    indexes: ['date'],
});
