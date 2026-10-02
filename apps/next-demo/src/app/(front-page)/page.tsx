import type { Metadata } from 'next';
import { inStoredOrder } from '@kizunajs/cms/next';
import { cms } from '../../cms';
import { apiClient } from '../../lib/api-client';
import { Hero } from '../../components/Hero';
import { ProductGrid } from '../../components/ProductGrid';
import { ArticleCard } from '../../components/ArticleCard';

/**
 * The product grid comes from this app's own API, which `next build` cannot
 * reach, so the built page starts with an empty grid and fills on the first
 * revalidation. Publishing and product changes revalidate at once.
 */
export const revalidate = 60;

const listProducts = async () => {
    try {
        const result = await apiClient.products.listProducts({
            query: {},
        });
        return result.status === 200 ? result.body.products : [];
    } catch {
        return [];
    }
};

export async function generateMetadata(): Promise<Metadata> {
    const content = await cms.pages.frontPage.get();
    return {
        title: content.seo.title,
        description: content.seo.description,
    };
}

export default async function FrontPage() {
    const content = await cms.pages.frontPage.get();
    const featured = inStoredOrder(content.featured, await listProducts(), (product) => product.id);
    const articles =
        content.articles.length > 0
            ? await cms.collections.articles.getMany({
                  ids: content.articles,
              })
            : (
                  await cms.collections.articles.list({
                      limit: 3,
                  })
              ).items;

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '56rem',
                margin: '0 auto',
            }}>
            <nav
                style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '2rem',
                }}>
                <a href="/blog">Blog</a>
                <a href="/team">Team</a>
                <a href="/contact">Contact</a>
                <a href="/cms">Edit content</a>
                <a href="/demo">API demo</a>
            </nav>
            <Hero {...content.hero} />
            <ProductGrid products={featured} />
            {articles.length > 0 ? (
                <section
                    style={{
                        marginTop: '3rem',
                    }}>
                    <h2>From the blog</h2>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(14rem, 1fr))',
                            gap: '1.5rem',
                        }}>
                        {articles.map((article) => (
                            <ArticleCard key={article.id} article={article} />
                        ))}
                    </div>
                </section>
            ) : null}
        </main>
    );
}
