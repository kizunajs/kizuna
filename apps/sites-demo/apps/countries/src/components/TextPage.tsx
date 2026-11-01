import { CmsImage, PageIntro, Prose, RelatedLinks, type Image, type RelatedLink } from '@kizunajs-demo/sites-ui';
import styles from './TextPage.module.css';

/**
 * A page of text: its heading and intro, the photo beside it, its
 * paragraphs, and links to read more.
 */
export function TextPage({
    eyebrow,
    page,
    readMore = 'Read more',
}: {
    eyebrow: string;
    page: {
        heading: string;
        intro: string;
        body: string;
        image?: Image | undefined;
        related?: RelatedLink[] | undefined;
    };
    readMore?: string;
}) {
    return (
        <main>
            <PageIntro eyebrow={eyebrow} heading={page.heading} text={page.intro} />
            {page.image === undefined ? null : <CmsImage className={styles.image} image={page.image} width={1200} height={800} />}
            <Prose text={page.body} />
            <RelatedLinks heading={readMore} links={page.related ?? []} />
        </main>
    );
}
