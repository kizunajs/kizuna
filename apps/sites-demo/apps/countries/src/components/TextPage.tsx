import type { BodyText as BodyTextValue } from '@kizunajs-demo/sites-content/body-links';
import { CmsImage, PageIntro, RelatedLinks, type Image, type RelatedLink } from '@kizunajs-demo/sites-ui';
import { BodyText } from './BodyText';
import styles from './TextPage.module.css';

/**
 * A page of text: its heading and intro, the photo beside it, its text
 * with its blocks, and links to read more.
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
        body: BodyTextValue;
        image?: Image | undefined;
        related?: RelatedLink[] | undefined;
    };
    readMore?: string;
}) {
    return (
        <main>
            <PageIntro eyebrow={eyebrow} heading={page.heading} text={page.intro} />
            {page.image === undefined ? null : <CmsImage className={styles.image} image={page.image} width={1200} height={800} />}
            <BodyText value={page.body} />
            <RelatedLinks heading={readMore} links={page.related ?? []} />
        </main>
    );
}
