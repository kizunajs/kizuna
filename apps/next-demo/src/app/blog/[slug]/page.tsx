import type { Metadata } from 'next';
import kizuna from '@kizuna-config';
import { topics } from '../../../cms/content';
import { formatDate } from '../../../lib/format';
import { Hero } from '../../../components/blocks/Hero';
import { Prose } from '../../../components/Prose';
import { Section } from '../../../components/Section';
import { ArticleGrid } from '../../../components/ArticleGrid';
import { EmployeeCard } from '../../../components/EmployeeCard';
import styles from './page.module.css';

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
            : (
                  await kizuna.content.collections.articles.list({
                      where: {
                          topic: article.topic,
                      },
                      orderBy: 'publishedOn',
                      direction: 'desc',
                      limit: 4,
                  })
              ).items
                  .filter((candidate) => candidate.id !== article.id)
                  .slice(0, 3);

    return (
        <main>
            <Hero
                impact="high"
                heading={article.title}
                subheading={article.excerpt}
                image={article.cover}
                eyebrow={<a href={`/blog?topic=${article.topic}`}>{topics[article.topic]}</a>}>
                <p className={styles.byline}>
                    {author === undefined ? null : <span>{author.name}</span>}
                    {article.publishedOn === undefined ? null : (
                        <time dateTime={article.publishedOn}>{formatDate(article.publishedOn)}</time>
                    )}
                </p>
            </Hero>
            <Section width="narrow" tight>
                <Prose value={article.body} />
                {author === undefined ? null : (
                    <aside className={styles.author}>
                        <h2 className={styles.authorHeading}>Written by</h2>
                        <EmployeeCard employee={author} />
                    </aside>
                )}
            </Section>
            {related.length === 0 ? null : (
                <Section heading="Related articles">
                    <ArticleGrid articles={related} />
                </Section>
            )}
        </main>
    );
}
