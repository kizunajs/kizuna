import type { Metadata } from 'next';
import { cms } from '../../cms';
import { ArticleCard } from '../../components/ArticleCard';

export const metadata: Metadata = {
    title: 'Blog',
};

const TOPICS = ['News', 'Guides', 'Stories'];

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
    const { topic } = await searchParams;
    const content = await cms.pages.blogIndexPage.get();
    const chosen = topic !== undefined && TOPICS.includes(topic) ? topic : undefined;
    const { items } = await cms.collections.articles.list({
        where:
            chosen === undefined
                ? {}
                : {
                      topic: chosen,
                  },
        limit: 20,
    });

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '56rem',
                margin: '0 auto',
            }}>
            <h1>{content.heading}</h1>
            <p
                style={{
                    color: '#555',
                }}>
                {content.intro}
            </p>
            <nav
                style={{
                    display: 'flex',
                    gap: '1rem',
                    margin: '1rem 0 2rem',
                }}>
                <a href="/blog">All</a>
                {TOPICS.map((name) => (
                    <a key={name} href={`/blog?topic=${name}`}>
                        {name}
                    </a>
                ))}
            </nav>
            <ul
                style={{
                    listStyle: 'none',
                    padding: 0,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(16rem, 1fr))',
                    gap: '1.5rem',
                }}>
                {items.map((article) => (
                    <li key={article.id}>
                        <ArticleCard article={article} />
                    </li>
                ))}
            </ul>
            {items.length === 0 ? <p>No articles yet.</p> : null}
        </main>
    );
}
