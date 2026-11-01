import kizuna from '@kizunajs-demo/sites-content/config';
import { CmsImage, PageIntro } from '@kizunajs-demo/sites-ui';
import { BodyText } from '../../../components/BodyText';
import styles from './page.module.css';

const read = (id: string) =>
    kizuna.content.collections.articles.get({
        id,
    });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
    return {
        title: (await read((await params).id)).title,
    };
}

/**
 * An article from the journal: its title and summary, its photo, and its
 * text with its blocks. Live Preview shows an article here.
 */
export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
    const article = await read((await params).id);
    return (
        <main>
            <PageIntro eyebrow="Journal" heading={article.title} text={article.summary} />
            {article.image === undefined ? null : <CmsImage className={styles.image} image={article.image} width={1200} height={800} />}
            <BodyText value={article.body} />
        </main>
    );
}
