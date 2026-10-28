import type { Output } from '@kizunajs/cms';
import type { Articles } from '../cms/content';
import { topics } from '../cms/content';
import { sizedImage } from '../lib/image';
import { Emphasis } from './Emphasis';
import styles from './ArticleTile.module.css';

type Article = Pick<Output<typeof Articles>, 'id' | 'title' | 'slug' | 'excerpt' | 'cover' | 'topic'>;

/**
 * An article as a photo, then its topic set small beside its title.
 */
export function ArticleTile({ article, shape = 'portrait' }: { article: Article; shape?: 'portrait' | 'landscape' }) {
    const [width, height] = shape === 'portrait' ? [800, 1000] : [1600, 1000];
    return (
        <a href={`/blog/${article.slug}`} className={styles.tile}>
            <img
                className={shape === 'portrait' ? styles.portrait : styles.landscape}
                src={sizedImage(article.cover.url, width, height)}
                alt={article.cover.alt}
                width={width}
                height={height}
                loading="lazy"
            />
            <span className={styles.meta}>
                <span className={styles.topic}>{topics[article.topic]}</span>
                <span className={styles.text}>
                    <span className={styles.title}>
                        <Emphasis text={article.title} />
                        <span className={styles.arrow} aria-hidden="true">
                            {' ↗'}
                        </span>
                    </span>
                    <span className={styles.excerpt}>{article.excerpt}</span>
                </span>
            </span>
        </a>
    );
}
