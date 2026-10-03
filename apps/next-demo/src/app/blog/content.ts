import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { HeadingSchema } from '../../cms/schemas';

export default definePage({
    name: 'blogIndexPage',
    label: 'Blog',
    group: 'Blog',
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'intro',
            schema: z.string().max(240).describe('What the blog is about, in a sentence or two.'),
        },
    ],
});
