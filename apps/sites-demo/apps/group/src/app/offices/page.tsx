import kizuna from '@kizunajs-demo/sites-content/config';
import { OfficeList, PageIntro } from '@kizunajs-demo/sites-ui';

export const metadata = {
    title: 'Shops',
};

export default async function OfficesPage() {
    const { items: offices } = await kizuna.content.collections.offices.list({
        orderBy: 'order',
        direction: 'asc',
    });
    return (
        <main>
            <PageIntro eyebrow="Shops" heading="Where to find us" />
            <OfficeList offices={offices} />
        </main>
    );
}
