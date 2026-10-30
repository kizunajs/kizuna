import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro, Prose } from '@kizunajs-demo/sites-ui';

export const metadata = {
    title: 'About',
};

export default async function AboutPage() {
    const page = await kizuna.content.of(['group']).pages.aboutPage.get();
    return (
        <main>
            <PageIntro eyebrow="About" heading={page.heading} />
            <Prose text={page.body} />
        </main>
    );
}
