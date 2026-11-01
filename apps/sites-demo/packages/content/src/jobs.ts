import { ContentEventSchema } from '@kizunajs/cms';
import { k } from './k';

/**
 * The content API's own jobs. `on` on cms() queues them as content changes.
 */
export const jobs = k.jobs({
    announceArticle: k
        .job({
            summary: 'Tell the weekly list about an article that went live',
            input: ContentEventSchema,
        })
        .handler(async ({ input, plugins }) => {
            const title = String(input.after['title']);
            await plugins.resend.sendBroadcast({
                list: 'weekly',
                name: `New article: ${title}`,
                subject: `New in the journal: ${title}`,
                html: `<h1>${title}</h1><p>${String(input.after['summary'] ?? '')}</p><p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a></p>`,
            });
        }),
});
