import kizuna from '@kizunajs-demo/sites-content/config';
import { OfficeList, PageIntro } from '@kizunajs-demo/sites-ui';
import { wordsOf } from '../../lib/words';
import { localeOf } from '../../lib/locale';

export async function generateMetadata() {
    return {
        title: wordsOf(kizuna.content.of(['uk', 'norway']).site, await localeOf()).shops,
    };
}

export default async function OfficesPage() {
    const locale = await localeOf();
    const said = wordsOf(kizuna.content.of(['uk', 'norway']).site, locale);
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
        locale,
    });
    return (
        <main>
            <PageIntro eyebrow={said.shops} heading={said.whereToFind} />
            <OfficeList offices={offices} />
        </main>
    );
}
