import { z } from 'zod';
import { Kizuna } from '@ts-kizuna/core';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { tags } from './tags';
import { user, member, inviteToken, scheduler } from './identities';
import { analytics } from './request-context';

/**
 * What every guard refuses with. `code` carries a default, because kizuna sends
 * this body itself when an access gate turns a caller away.
 */
export const GuardSchema = Kizuna.model({
    title: 'GuardDenial',
    schema: ProblemDetailsSchema.extend({
        code: z.enum(['unauthenticated', 'expired_token', 'forbidden', 'not_found']).default('forbidden'),
    }),
});

export const k = new Kizuna({
    identities: {
        user,
        member,
        inviteToken,
        scheduler,
    },
    requestContext: {
        analytics,
    },
    tags,
    validation: {
        issueCodes: ['invalid_phone_number'],
    },
    guardSchema: GuardSchema,
});
