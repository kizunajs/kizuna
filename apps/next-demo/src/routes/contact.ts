import { z } from 'zod';
import { k } from '../k';

const messages: Array<{ name: string; email: string; message: string }> = [];

export const contact = k.routes({
    send: k
        .route({
            method: 'POST',
            path: '/contact',
            auth: false,
            summary: 'Send a message from the contact form',
            body: z.object({
                name: z.string().min(1).max(100),
                email: z.email(),
                message: z.string().min(1).max(2000),
            }),
            responses: {
                204: z.void(),
            },
        })
        .handler(({ body }) => {
            messages.push(body);
            return {
                status: 204,
                body: undefined,
            };
        }),
});
