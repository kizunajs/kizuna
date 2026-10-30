import kizuna from '@kizunajs-demo/sites-content/config';
import { OfficeCard } from '@kizunajs-demo/sites-ui';

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
            <h1>Our shops</h1>
            {offices.map((office) => (
                <OfficeCard key={office.id} office={office} />
            ))}
        </main>
    );
}
