import type { Output } from '@kizunajs/cms';
import kizuna from '@kizuna-config';
import type { ArchiveBlockSchema } from '../../cms/blocks';
import { Emphasis } from '../Emphasis';
import { Eyebrow } from '../Eyebrow';
import { ButtonLink } from '../ButtonLink';
import { ArticleTile } from '../ArticleTile';
import styles from './Archive.module.css';

/**
 * Three articles laid out like a magazine spread: a tall one, a second set
 * lower beside it, and a wide one under both.
 */
export async function Archive({ eyebrow, heading, topic, articles }: Output<typeof ArchiveBlockSchema>) {
    const items =
        articles.length > 0
            ? await kizuna.content.collections.articles.getMany({
                  ids: articles,
              })
            : (
                  await kizuna.content.collections.articles.list({
                      where:
                          topic === undefined
                              ? {}
                              : {
                                    topic,
                                },
                      orderBy: 'publishedOn',
                      direction: 'desc',
                      limit: 3,
                  })
              ).items;

    if (items.length === 0) return null;

    return (
        <section className={styles.section}>
            <div className={styles.header}>
                <div className={styles.titles}>
                    <Eyebrow text={eyebrow} />
                    <h2 className={styles.heading}>
                        <Emphasis text={heading} />
                    </h2>
                </div>
                <ButtonLink href={topic === undefined ? '/blog' : `/blog?topic=${topic}`} label="All articles" variant="arrow" />
            </div>
            <ul className={styles.spread}>
                {items.map((article, index) => (
                    <li key={article.id} className={styles.item}>
                        <ArticleTile article={article} shape={index === 2 ? 'landscape' : 'portrait'} />
                    </li>
                ))}
            </ul>
        </section>
    );
}
