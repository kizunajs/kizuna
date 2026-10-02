import { z } from 'zod';
import { defineBlock } from '@kizunajs/cms';
import { ImageSchema } from '@kizunajs/cms/schemas';
import { CtaSchema, HeadingSchema } from './schemas';

export const HeroBlockSchema = defineBlock({
    slug: 'hero',
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'subheading',
            schema: z.string().max(200).describe('One sentence under the heading.'),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
        {
            name: 'cta',
            schema: CtaSchema,
        },
    ],
});
