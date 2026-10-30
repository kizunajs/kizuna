import kizuna from '@kizunajs-demo/sites-content/config';
import { ArticleList, PageIntro } from '@kizunajs-demo/sites-ui';

export const metadata = {
    title: 'Journal',
};

export default async function JournalPage() {
    const { items: articles } = await kizuna.content.collections.articles.list({
        orderBy: 'date',
        direction: 'desc',
    });
    return (
        <main>
            <PageIntro eyebrow="Journal" heading="From all three shops" />
            <ArticleList articles={articles} locale="en-GB" />
        </main>
    );
}
