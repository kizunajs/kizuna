import type { Output } from '@kizunajs/cms';
import type { MediaBlockSchema } from '../../cms/blocks';
import { sizedImage } from '../../lib/image';
import { Emphasis } from '../Emphasis';
import styles from './Media.module.css';

/**
 * One photo the width of the window. With a heading, a green band above it
 * introduces the photo.
 */
export function Media({ image, caption, heading, body, tone = 'sage' }: Output<typeof MediaBlockSchema> & { tone?: 'forest' | 'sage' }) {
    return (
        <section className={styles.section}>
            {heading === undefined ? null : (
                <div className={tone === 'forest' ? styles.forest : styles.sage}>
                    <h2 className={styles.heading}>
                        <Emphasis text={heading} />
                    </h2>
                    {body === undefined ? null : <p className={styles.body}>{body}</p>}
                </div>
            )}
            <figure>
                <img
                    className={styles.image}
                    src={sizedImage(image.url, 1600, 800)}
                    alt={image.alt}
                    width={1600}
                    height={800}
                    loading="lazy"
                />
                {caption === undefined ? null : <figcaption className={styles.caption}>{caption}</figcaption>}
            </figure>
        </section>
    );
}
