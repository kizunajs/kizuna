import type { Metadata, Route } from 'next';
import kizuna from '@kizuna-config';
import { topics } from '../../cms/content';
import { formatDate } from '../../lib/format';
import { sizedImage } from '../../lib/image';
import { Hero } from '../../components/blocks/Hero';
import { ArticleTile } from '../../components/ArticleTile';
import { Emphasis } from '../../components/Emphasis';
import styles from './page.module.css';

const PAGE_SIZE = 7;

export async function generateMetadata(): Promise<Metadata> {
    const content = await kizuna.content.pages.blogIndexPage.get();
    return {
        title: content.seo?.title ?? 'Journal',
        description: content.seo?.description ?? content.intro,
    };
}

const isTopic = (value: string | undefined): value is keyof typeof topics => value !== undefined && value in topics;

const hrefFor = (topic: string | undefined, after?: string): Route => {
    const query = new URLSearchParams();
    if (topic !== undefined) query.set('topic', topic);
    if (after !== undefined) query.set('after', after);
    const search = query.toString();
    return (search === '' ? '/blog' : `/blog?${search}`) as Route;
};

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ topic?: string; after?: string }> }) {
    const { topic, after } = await searchParams;
    const content = await kizuna.content.pages.blogIndexPage.get();
    const chosen = isTopic(topic) ? topic : undefined;
    const { items, next } = await kizuna.content.collections.articles.list({
        where:
            chosen === undefined
                ? {}
                : {
                      topic: chosen,
                  },
        orderBy: 'publishedOn',
        direction: 'desc',
        limit: PAGE_SIZE,
        ...(after === undefined
            ? {}
            : {
                  cursor: after,
              }),
    });

    // The first page of every topic opens on one article set large.
    const firstPage = after === undefined;
    const picked =
        firstPage && chosen === undefined && content.featured !== undefined
            ? (
                  await kizuna.content.collections.articles.getMany({
                      ids: [content.featured],
                  })
              )[0]
            : undefined;
    const featured = firstPage ? (picked ?? items[0]) : undefined;
    const rest = items.filter((article) => article.id !== featured?.id);

    return (
        <main>
            <Hero impact="low" eyebrow={content.eyebrow} heading={content.heading} subheading={content.intro}>
                <nav className={styles.topics} aria-label="Topics">
                    <a href={hrefFor(undefined)} className={styles.topic} aria-current={chosen === undefined ? 'page' : undefined}>
                        Everything
                    </a>
                    {Object.entries(topics).map(([value, name]) => (
                        <a key={value} href={hrefFor(value)} className={styles.topic} aria-current={chosen === value ? 'page' : undefined}>
                            {name}
                        </a>
                    ))}
                </nav>
            </Hero>

            {featured === undefined ? null : (
                <a href={`/blog/${featured.slug}`} className={styles.featured}>
                    <img
                        className={styles.featuredImage}
                        src={sizedImage(featured.cover.url, 1500, 1000)}
                        alt={featured.cover.alt}
                        width={1500}
                        height={1000}
                    />
                    <span className={styles.featuredText}>
                        <span className={styles.featuredMeta}>
                            {topics[featured.topic]}
                            {featured.publishedOn === undefined ? null : (
                                <time dateTime={featured.publishedOn}>{formatDate(featured.publishedOn)}</time>
                            )}
                        </span>
                        <span className={styles.featuredTitle}>
                            <Emphasis text={featured.title} />
                            <span aria-hidden="true">{' ↗'}</span>
                        </span>
                        <span className={styles.featuredExcerpt}>{featured.excerpt}</span>
                    </span>
                </a>
            )}

            {items.length === 0 ? (
                <p className={styles.empty}>Nothing under this topic yet. The next article is on its way.</p>
            ) : rest.length === 0 ? null : (
                <ul className={styles.grid}>
                    {rest.map((article) => (
                        <li key={article.id}>
                            <ArticleTile article={article} />
                        </li>
                    ))}
                </ul>
            )}

            {after === undefined && next === undefined ? null : (
                <nav className={styles.pages} aria-label="Pages">
                    {after === undefined ? <span /> : <a href={hrefFor(chosen)}>← Back to the latest</a>}
                    {next === undefined ? null : <a href={hrefFor(chosen, next)}>Older articles →</a>}
                </nav>
            )}
        </main>
    );
}
