import { z } from 'zod';
import { defineCollection } from '@kizunajs/cms';
import { RichTextSchema } from '@kizunajs/cms/schemas';
import { NewsletterId } from './ids';
import { BROADCAST_RECIPIENT, renderNewsletter } from './newsletter-email';

/**
 * The editor an action runs as, as the editor identity's guard returns them.
 * Their `userId` is their email address.
 */
const SenderSchema = z.object({
    userId: z.string(),
    name: z.string(),
});

/**
 * Hagen's newsletter. Live Preview shows an issue as the email, any editor can
 * send themselves a test, and an admin sends it to the weekly list. Someone
 * other than its writer approves an issue before it publishes.
 */
export const Newsletters = defineCollection({
    name: 'newsletters',
    id: NewsletterId,
    requireReview: true,
    preview: {
        url: ({ item }) => `/newsletters/${item.id}`,
    },
    fields: [
        {
            name: 'subject',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'preheader',
            schema: z.string().max(140).optional().describe('The line an inbox shows after the subject.'),
        },
        {
            name: 'body',
            schema: RichTextSchema,
        },
    ],
    actions: {
        sendTest: {
            label: 'Send me a test',
            handler: async ({ item, editor, plugins }) => {
                const sender = SenderSchema.parse(editor);
                await plugins.resend.sendEmail({
                    to: sender.userId,
                    subject: item.subject,
                    html: await renderNewsletter(item, {
                        firstName: sender.name.split(' ')[0] ?? sender.name,
                    }),
                });
            },
        },
        send: {
            label: 'Send to weekly',
            auth: {
                roles: 'admin',
            },
            confirm: 'Send this issue to everyone on the weekly list?',
            handler: async ({ item, plugins }) => {
                await plugins.resend.sendBroadcast({
                    list: 'weekly',
                    name: item.subject,
                    subject: item.subject,
                    html: await renderNewsletter(item, BROADCAST_RECIPIENT),
                });
            },
        },
    },
});
