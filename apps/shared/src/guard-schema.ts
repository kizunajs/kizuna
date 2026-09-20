import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';

/**
 * What every guard refuses with. `code` carries a default, because kizuna sends
 * this body itself when a route's `requires` turns a caller away.
 */
export const GuardSchema = Kizuna.model({
    title: 'GuardDenial',
    schema: ProblemDetailsSchema.extend({
        code: z.enum(['unauthenticated', 'expired_token', 'forbidden', 'not_found']).default('forbidden'),
    }),
});
