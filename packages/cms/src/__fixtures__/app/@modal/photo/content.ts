import { page } from '../../../../page.js';
import { z } from 'zod';

export default page({
    name: 'photoPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});
