import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro, Prose } from '@kizunajs-demo/sites-ui';
import { wordsOf } from '../../lib/words';
import { localeOf } from '../../lib/locale';

export async function generateMetadata() {
    const policy = await kizuna.content.globals.privacyPolicy.get({
        locale: await localeOf(),
    });
    return {
        title: policy.heading,
    };
}

export default async function PrivacyPage() {
    const locale = await localeOf();
    const said = wordsOf(kizuna.content.of(['uk', 'norway']).site, locale);
    const policy = await kizuna.content.globals.privacyPolicy.get({
        locale,
    });
    const dateFormat = new Intl.DateTimeFormat(locale === 'nb' ? 'nb-NO' : 'en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    });
    return (
        <main>
            <PageIntro eyebrow={`${said.lastUpdated} ${dateFormat.format(new Date(policy.updatedOn))}`} heading={policy.heading} />
            <Prose text={policy.body} />
        </main>
    );
}
