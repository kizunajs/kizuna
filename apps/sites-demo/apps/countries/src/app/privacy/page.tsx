import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro, Prose } from '@kizunajs-demo/sites-ui';

export const metadata = {
    title: 'Privacy policy',
};

const dateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

export default async function PrivacyPage() {
    const policy = await kizuna.content.globals.privacyPolicy.get();
    return (
        <main>
            <PageIntro eyebrow={`Last updated ${dateFormat.format(new Date(policy.updatedOn))}`} heading={policy.heading} />
            <Prose text={policy.body} />
        </main>
    );
}
