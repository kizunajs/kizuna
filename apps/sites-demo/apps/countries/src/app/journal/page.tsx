import kizuna from '@kizunajs-demo/sites-content/config';
import { ArticleList, PageIntro } from '@kizunajs-demo/sites-ui';
import { words } from '../../lib/words';

export const metadata = {
    title: 'Journal',
};

export default async function JournalPage() {
    const site = await kizuna.content.site.get();
    const said = words[kizuna.content.of(['uk', 'norway']).site];
    const { items: articles } = await kizuna.content.collections.articles.list({
        orderBy: 'date',
        direction: 'desc',
    });
    return (
        <main>
            <PageIntro eyebrow={said.journal} heading={said.fromTheShops} />
            <ArticleList articles={articles} locale={site.locales?.[0] ?? 'en'} />
        </main>
    );
}
