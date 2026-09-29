import { z } from 'zod';
import { k } from '../k';
import { EmailSchema } from '../plugins/email/types';

export const contact = k.routes({
    sendMessage: k
        .route({
            method: 'POST',
            path: '/contact',
            auth: false,
            body: EmailSchema.pick({
                subject: true,
                html: true,
            }),
            responses: {
                204: z.void(),
            },
            summary: 'Send a message to the team',
        })
        .handler(({ body, plugins }) => {
            plugins.email.send({
                to: 'team@example.com',
                ...body,
            });

            return {
                status: 204,
                body: undefined,
            };
        }),
});
