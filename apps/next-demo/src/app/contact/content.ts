import { z } from 'zod';
import { page } from '@kizunajs/cms';
import { HeadingSchema } from '../../cms/schemas';

export default page({
    name: 'contactPage',
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'intro',
            schema: z.string().max(240).describe('Why someone should write, in a sentence or two.'),
        },
        {
            name: 'buttonLabel',
            schema: z.string().min(1).max(24).default('Send'),
        },
        {
            name: 'thanks',
            schema: z.string().max(200).describe('Shown after the form is sent.'),
        },
    ],
});
