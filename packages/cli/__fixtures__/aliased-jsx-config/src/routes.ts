import { Kizuna } from 'kizunajs';
import { z } from 'zod';
import { welcomeSubject } from './welcome-email';

const k = new Kizuna();

export const routes = k.routes('users', {
    getWelcomeEmail: k.route({
        method: 'GET',
        path: '/users/:id/welcome-email',
        responses: {
            200: z.object({
                subject: z.string(),
            }),
        },
        handler: () => ({
            status: 200,
            body: {
                subject: welcomeSubject,
            },
        }),
    }),
});
