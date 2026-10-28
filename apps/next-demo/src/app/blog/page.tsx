import type { Metadata, Route } from 'next';
import kizuna from '@kizuna-config';
import { topics } from '../../cms/content';
import { Hero } from '../../components/blocks/Hero';
import { ArticleGrid } from '../../components/ArticleGrid';
import { Section } from '../../components/Section';
import styles from './page.module.css';

export const metadata: Metadata = {
    title: 'Blog',
};

const PAGE_SIZE = 6;

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

    return (
        <main>
            <Hero impact="low" heading={content.heading} subheading={content.intro} />
            <Section tight>
                <nav className={styles.topics} aria-label="Topics">
                    <a href={hrefFor(undefined)} className={styles.topic} aria-current={chosen === undefined ? 'page' : undefined}>
                        All
                    </a>
                    {Object.entries(topics).map(([value, name]) => (
                        <a key={value} href={hrefFor(value)} className={styles.topic} aria-current={chosen === value ? 'page' : undefined}>
                            {name}
                        </a>
                    ))}
                </nav>
                {items.length === 0 ? <p className={styles.empty}>No articles here yet.</p> : <ArticleGrid articles={items} />}
                {after !== undefined || next !== undefined ? (
                    <nav className={styles.pages} aria-label="Pages">
                        {after === undefined ? <span /> : <a href={hrefFor(chosen)}>Back to the latest</a>}
                        {next === undefined ? null : <a href={hrefFor(chosen, next)}>Older articles</a>}
                    </nav>
                ) : null}
            </Section>
        </main>
    );
}
