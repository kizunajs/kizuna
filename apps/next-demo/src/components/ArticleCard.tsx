import type { Output } from '@kizunajs/cms';
import { topics, type Articles } from '../cms/content';
import { formatDate } from '../lib/format';
import { sizedImage } from '../lib/image';
import styles from './ArticleCard.module.css';

const WIDTH = 720;
const HEIGHT = 480;

export function ArticleCard({ article }: { article: Output<typeof Articles> }) {
    return (
        <article className={styles.card}>
            <img
                className={styles.cover}
                src={sizedImage(article.cover.url, WIDTH, HEIGHT)}
                alt={article.cover.alt}
                width={WIDTH}
                height={HEIGHT}
            />
            <div className={styles.body}>
                <p className={styles.meta}>
                    <span className={styles.topic}>{topics[article.topic]}</span>
                    {article.publishedOn === undefined ? null : (
                        <time dateTime={article.publishedOn}>{formatDate(article.publishedOn)}</time>
                    )}
                </p>
                <h3 className={styles.title}>
                    <a href={`/blog/${article.slug}`} className={styles.link}>
                        {article.title}
                    </a>
                </h3>
                <p className={styles.excerpt}>{article.excerpt}</p>
            </div>
        </article>
    );
}
