import { page } from '../../../../page.js';
import { z } from 'zod';

export default page({
    name: 'springPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});
