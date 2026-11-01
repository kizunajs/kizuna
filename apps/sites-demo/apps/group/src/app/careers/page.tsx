import kizuna from '@kizunajs-demo/sites-content/config';
import { PageIntro, Prose, RelatedLinks } from '@kizunajs-demo/sites-ui';

const read = () => kizuna.content.of(['group']).pages.careersPage.get();

export async function generateMetadata() {
    return {
        title: (await read()).heading,
    };
}

export default async function CareersPage() {
    const page = await read();
    return (
        <main>
            <PageIntro eyebrow="Careers" heading={page.heading} text={page.intro} />
            <Prose text={page.body} />
            <RelatedLinks heading="Read more" links={page.related ?? []} />
        </main>
    );
}
