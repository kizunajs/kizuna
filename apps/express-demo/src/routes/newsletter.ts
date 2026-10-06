import { z } from 'zod';
import { k } from '../k';

export const newsletter = k.routes.newsletter({
    subscribe: k
        .route({
            method: 'POST',
            path: '/newsletter/subscribers',
            auth: false,
            body: z.object({
                email: z.email(),
            }),
            responses: {
                204: z.void(),
            },
            summary: 'Subscribe to the weekly newsletter',
        })
        .handler(async ({ body, plugins }) => {
            await plugins.resend.subscribe({
                email: body.email,
                list: 'weekly',
            });

            return {
                status: 204,
                body: undefined,
            };
        }),
});
