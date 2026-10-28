import kizuna from '@kizuna-config';
import type { Output } from '@kizunajs/cms';
import type { ArchiveBlockSchema } from '../../cms/blocks';
import { ArticleGrid } from '../ArticleGrid';
import { Section } from '../Section';
import styles from './Archive.module.css';

/**
 * The articles an editor picked, or the latest three of a topic.
 */
export async function Archive({ heading, topic, articles }: Output<typeof ArchiveBlockSchema>) {
    const shown =
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
    if (shown.length === 0) return null;

    return (
        <Section heading={heading}>
            <ArticleGrid articles={shown} />
            <a href={topic === undefined ? '/blog' : `/blog?topic=${topic}`} className={styles.more}>
                All articles
            </a>
        </Section>
    );
}
