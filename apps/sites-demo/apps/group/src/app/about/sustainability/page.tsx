import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro } from '@kizunajs-demo/sites-ui';
import { BodyText } from '../../../components/BodyText';

const read = () => kizuna.content.of(['group']).pages.sustainabilityPage.get();

export async function generateMetadata() {
    return {
        title: (await read()).heading,
    };
}

export default async function SustainabilityPage() {
    const page = await read();
    return (
        <main>
            <PageIntro eyebrow="About" heading={page.heading} text={page.intro} />
            <BodyText value={page.body} />
        </main>
    );
}
