import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { ImageSchema } from '@kizunajs/cms/schemas';
import { HeadingSchema } from '../../cms/schemas';

export default definePage({
    name: 'teamPage',
    label: 'Team',
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'intro',
            schema: z.string().max(240).describe('Who the team is, in a sentence or two.'),
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
            description: 'The whole team, shown wide above the list.',
        },
    ],
});
