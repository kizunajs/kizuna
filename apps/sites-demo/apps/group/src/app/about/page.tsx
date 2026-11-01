import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro } from '@kizunajs-demo/sites-ui';
import { BodyText } from '../../components/BodyText';

export const metadata = {
    title: 'About',
};

export default async function AboutPage() {
    const page = await kizuna.content.of(['group']).pages.aboutPage.get();
    return (
        <main>
            <PageIntro eyebrow="About" heading={page.heading} />
            <BodyText value={page.body} />
        </main>
    );
}
