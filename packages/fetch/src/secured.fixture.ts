import { expressAdapter } from '@kizunajs/express';
import { z } from 'zod';
import { Kizuna, defineConfig } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';

interface Config {
    auth: {
        identities: {
            user: typeof userIdentity;
        };
        guardSchema: typeof GuardRefusalSchema;
    };
}

const k = new Kizuna<Config>();

const GuardRefusalSchema = ProblemDetailsSchema.extend({
    code: z.enum(['expired_token', 'forbidden']).default('forbidden'),
});

const userIdentity = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(({ bearer, deny }) => {
        if (bearer?.token !== 'tok_ada')
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                    code: 'expired_token',
                },
            });
        return {
            userId: '1',
        };
    });

export const securedContract = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            user: userIdentity,
        },
        guardSchema: GuardRefusalSchema,
    },
    routes: {
        account: k.routes({
            whoAmI: k
                .route({
                    method: 'GET',
                    path: '/who-am-i',
                    auth: 'user',
                    responses: {
                        200: z.object({
                            userId: z.string(),
                        }),
                    },
                })
                .handler(({ auth }) => ({
                    status: 200,
                    body: {
                        userId: auth.user.userId,
                    },
                })),
        }),
    },
}).api;
