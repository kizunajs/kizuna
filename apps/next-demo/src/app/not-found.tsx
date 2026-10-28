import { KizunaPreview } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { Hero } from '../components/blocks/Hero';

export default function NotFound() {
    return (
        <main>
            <Hero
                impact="low"
                eyebrow="Not found"
                heading="Nothing grows *here* yet"
                subheading="There is no page at this address. It may have moved, or it has not been published."
                links={[
                    {
                        label: 'Back to the shop',
                        href: '/',
                    },
                ]}
            />
            <KizunaPreview content={kizuna.content} />
        </main>
    );
}
