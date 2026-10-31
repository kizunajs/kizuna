import kizuna from '@kizunajs-demo/sites-content/config';
import { renderNewsletter } from '@kizunajs-demo/sites-content/newsletter-email';
import { EmailPreview } from '@kizunajs-demo/sites-ui';

export const metadata = {
    title: 'Newsletter',
};

/**
 * An issue of the newsletter as its recipients get it, where Live Preview
 * shows it.
 */
export default async function NewsletterPage({ params }: { params: Promise<{ id: string }> }) {
    const newsletter = await kizuna.content.collections.newsletters.get({
        id: (await params).id,
    });
    const html = await renderNewsletter(newsletter, {
        firstName: 'there',
    });
    return <EmailPreview html={html} title={newsletter.subject} />;
}
