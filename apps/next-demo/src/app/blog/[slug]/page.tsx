import type { Metadata } from 'next';
import type { Output } from '@kizunajs/cms';
import kizuna from '@kizuna-config';
import { topics, type Articles } from '../../../cms/content';
import { formatDate } from '../../../lib/format';
import { sizedImage } from '../../../lib/image';
import { Emphasis } from '../../../components/Emphasis';
import { Prose } from '../../../components/Prose';
import { ArticleTile } from '../../../components/ArticleTile';
import styles from './page.module.css';

interface Props {
    params: Promise<{
        slug: string;
    }>;
}

/**
 * Up to three other articles, the latest of the same topic first, then the
 * latest of any.
 */
const latestBeside = async (slug: string, topic: Output<typeof Articles>['topic']) => {
    const [sameTopic, any] = await Promise.all([
        kizuna.content.collections.articles.list({
            where: {
                topic,
            },
            orderBy: 'publishedOn',
            direction: 'desc',
            limit: 4,
        }),
        kizuna.content.collections.articles.list({
            orderBy: 'publishedOn',
            direction: 'desc',
            limit: 4,
        }),
    ]);
    const unique = new Map(
        [...sameTopic.items, ...any.items].filter((candidate) => candidate.slug !== slug).map((candidate) => [candidate.slug, candidate])
    );
    return [...unique.values()].slice(0, 3);
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const article = await kizuna.content.pages.articlePage.get(await params);
    return {
        title: article.seo?.title ?? article.title.replaceAll('*', ''),
        description: article.seo?.description ?? article.excerpt,
    };
}

export default async function ArticlePage({ params }: Props) {
    const article = await kizuna.content.pages.articlePage.get(await params);
    const [author] =
        article.author === undefined
            ? []
            : await kizuna.content.collections.employees.getMany({
                  ids: [article.author],
              });
    const related =
        article.related.length > 0
            ? await kizuna.content.collections.articles.getMany({
                  ids: article.related,
              })
            : await latestBeside(article.slug, article.topic);

    return (
        <main>
            <article>
                <header className={styles.header}>
                    <p className={styles.meta}>
                        <a href={`/blog?topic=${article.topic}`} className={styles.topic}>
                            {topics[article.topic]}
                        </a>
                        {article.publishedOn === undefined ? null : (
                            <time dateTime={article.publishedOn}>{formatDate(article.publishedOn)}</time>
                        )}
                    </p>
                    <h1 className={styles.title}>
                        <Emphasis text={article.title} />
                    </h1>
                    <p className={styles.excerpt}>{article.excerpt}</p>
                    {author === undefined ? null : (
                        <p className={styles.byline}>
                            {author.photo === undefined ? null : (
                                <img
                                    className={styles.bylinePhoto}
                                    src={sizedImage(author.photo.url, 96, 96)}
                                    alt=""
                                    width={96}
                                    height={96}
                                />
                            )}
                            <span>
                                By <strong>{author.name}</strong>, {author.role.charAt(0).toLowerCase() + author.role.slice(1)}
                            </span>
                        </p>
                    )}
                </header>

                <figure className={styles.cover}>
                    <img
                        className={styles.coverImage}
                        src={sizedImage(article.cover.url, 1600, 1000)}
                        alt={article.cover.alt}
                        width={1600}
                        height={1000}
                        fetchPriority="high"
                    />
                    {article.coverCaption === undefined ? null : <figcaption className={styles.caption}>{article.coverCaption}</figcaption>}
                </figure>

                <div className={styles.body}>
                    <Prose value={article.body} />
                </div>

                {author === undefined ? null : (
                    <aside className={styles.author} aria-label="About the author">
                        {author.photo === undefined ? null : (
                            <img
                                className={styles.authorPhoto}
                                src={sizedImage(author.photo.url, 240, 300)}
                                alt={author.photo.alt}
                                width={240}
                                height={300}
                                loading="lazy"
                            />
                        )}
                        <div className={styles.authorText}>
                            <p className={styles.authorLabel}>Written by</p>
                            <h2 className={styles.authorName}>{author.name}</h2>
                            <p className={styles.authorRole}>{author.role}</p>
                            {author.bio === undefined ? null : <p className={styles.authorBio}>{author.bio}</p>}
                        </div>
                    </aside>
                )}
            </article>

            {related.length === 0 ? null : (
                <section className={styles.related}>
                    <h2 className={styles.relatedHeading}>
                        Keep <em>reading</em>
                    </h2>
                    <ul className={styles.relatedList}>
                        {related.map((candidate) => (
                            <li key={candidate.id}>
                                <ArticleTile article={candidate} />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </main>
    );
}
