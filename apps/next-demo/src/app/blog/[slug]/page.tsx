import type { Metadata } from 'next';
import { RichText } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { topics } from '../../../cms/content';
import { EmployeeCard } from '../../../components/EmployeeCard';

interface Props {
    params: Promise<{
        slug: string;
    }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const article = await kizuna.content.pages.articlePage.get(await params);
    return {
        title: article.title,
        description: article.excerpt,
    };
}

export default async function BlogPostPage({ params }: Props) {
    const article = await kizuna.content.pages.articlePage.get(await params);
    const [author] =
        article.author === undefined
            ? []
            : await kizuna.content.collections.employees.getMany({
                  ids: [article.author],
              });

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '44rem',
                margin: '0 auto',
            }}>
            <p
                style={{
                    color: '#555',
                }}>
                <a href="/blog">Blog</a> · {topics[article.topic]}
            </p>
            <h1>{article.title}</h1>
            <img
                src={article.cover.url}
                alt={article.cover.alt}
                width={article.cover.width}
                height={article.cover.height}
                style={{
                    width: '100%',
                    height: 'auto',
                    borderRadius: '0.75rem',
                }}
            />
            <RichText value={article.body} />
            {author !== undefined ? (
                <aside
                    style={{
                        marginTop: '2rem',
                    }}>
                    <h2
                        style={{
                            fontSize: '1rem',
                        }}>
                        Written by
                    </h2>
                    <EmployeeCard employee={author} />
                </aside>
            ) : null}
        </main>
    );
}
