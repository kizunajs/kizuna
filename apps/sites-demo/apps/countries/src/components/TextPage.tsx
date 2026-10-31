import { CmsImage, PageIntro, Prose, type Image } from '@kizunajs-demo/sites-ui';
import styles from './TextPage.module.css';

/**
 * A page of text: its heading and intro, the photo beside it, and its
 * paragraphs.
 */
export function TextPage({
    eyebrow,
    page,
}: {
    eyebrow: string;
    page: {
        heading: string;
        intro: string;
        body: string;
        image?: Image | undefined;
    };
}) {
    return (
        <main>
            <PageIntro eyebrow={eyebrow} heading={page.heading} text={page.intro} />
            {page.image === undefined ? null : <CmsImage className={styles.image} image={page.image} width={1200} height={800} />}
            <Prose text={page.body} />
        </main>
    );
}
