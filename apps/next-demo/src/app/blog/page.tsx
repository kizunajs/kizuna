import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { topics } from '../../cms/content';
import { ArticleCard } from '../../components/ArticleCard';

export const metadata: Metadata = {
    title: 'Blog',
};

const isTopic = (value: string | undefined): value is keyof typeof topics => value !== undefined && value in topics;

export default async function BlogPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
    const { topic } = await searchParams;
    const content = await kizuna.content.pages.blogIndexPage.get();
    const chosen = isTopic(topic) ? topic : undefined;
    const { items } = await kizuna.content.collections.articles.list({
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
                {Object.entries(topics).map(([value, name]) => (
                    <a key={value} href={`/blog?topic=${value}`}>
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
