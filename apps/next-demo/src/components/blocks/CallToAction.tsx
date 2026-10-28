import type { Output } from '@kizunajs/cms';
import type { CallToActionBlockSchema } from '../../cms/blocks';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import { LinkRow } from '../ButtonLink';
import styles from './CallToAction.module.css';

/**
 * A full-width green band with one large sentence and what to do about it.
 */
export function CallToAction({
    eyebrow,
    heading,
    body,
    links,
    tone = 'forest',
}: Output<typeof CallToActionBlockSchema> & { tone?: 'forest' | 'sage' }) {
    return (
        <section className={tone === 'sage' ? styles.sage : styles.forest}>
            <div className={styles.inner}>
                <div className={styles.titles}>
                    <Eyebrow text={eyebrow} />
                    <h2 className={styles.heading}>
                        <Emphasis text={heading} />
                    </h2>
                </div>
                <div className={styles.action}>
                    {body === undefined ? null : <p className={styles.body}>{body}</p>}
                    <LinkRow links={links} />
                </div>
            </div>
        </section>
    );
}
