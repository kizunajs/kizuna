import kizuna from '@kizunajs-demo/sites-content/config';
import { OfficeList, PageIntro } from '@kizunajs-demo/sites-ui';
import { words } from '../../lib/words';

export const metadata = {
    title: 'Shops',
};

export default async function OfficesPage() {
    const said = words[kizuna.content.of(['uk', 'norway']).site];
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
    });
    return (
        <main>
            <PageIntro eyebrow={said.shops} heading={said.whereToFind} />
            <OfficeList offices={offices} />
        </main>
    );
}
