import { definePage } from '../../../../page.js';
import { z } from 'zod';

export default definePage({
    name: 'photoPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});
