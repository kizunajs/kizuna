import type { Output } from '@kizunajs/cms';
import { topics, type Articles } from '../cms/content';

export function ArticleCard({ article }: { article: Output<typeof Articles> }) {
    return (
        <a
            href={`/blog/${article.slug}`}
            style={{
                display: 'block',
                color: 'inherit',
                textDecoration: 'none',
            }}>
            <img
                src={article.cover.url}
                alt={article.cover.alt}
                width={article.cover.width}
                height={article.cover.height}
                style={{
                    width: '100%',
                    height: 'auto',
                    aspectRatio: '3 / 2',
                    objectFit: 'cover',
                    borderRadius: '0.75rem',
                }}
            />
            <span
                style={{
                    display: 'block',
                    color: '#555',
                    marginTop: '0.5rem',
                }}>
                {topics[article.topic]}
            </span>
            <strong>{article.title}</strong>
            <p
                style={{
                    color: '#555',
                    margin: '0.25rem 0 0',
                }}>
                {article.excerpt}
            </p>
        </a>
    );
}
