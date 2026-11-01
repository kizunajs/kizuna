import kizuna from '@kizunajs-demo/sites-content/config';
import { CmsImage, PageIntro } from '@kizunajs-demo/sites-ui';
import { BodyText } from '../../../components/BodyText';
import { localeOf } from '../../../lib/locale';
import { wordsOf } from '../../../lib/words';
import styles from '../../page.module.css';

const read = async (id: string) =>
    kizuna.content.collections.articles.get({
        id,
        locale: await localeOf(),
    });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    return {
        title: (await read((await params).id)).title,
    };
}

/**
 * An article from the journal: its title and summary, its photo, and its
 * text with its blocks.
 */
export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
    const article = await read((await params).id);
    const said = wordsOf(kizuna.content.of(['uk', 'norway']).site, await localeOf());
    return (
        <main>
            <PageIntro eyebrow={said.journal} heading={article.title} text={article.summary} />
            {article.image === undefined ? null : <CmsImage className={styles.hero} image={article.image} width={1200} height={800} />}
            <BodyText value={article.body} />
        </main>
    );
}
