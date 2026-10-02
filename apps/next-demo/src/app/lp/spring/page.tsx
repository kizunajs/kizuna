import type { Metadata } from 'next';
import { inStoredOrder } from '@kizunajs/cms/next';
import { cms } from '../../../cms';
import { apiClient } from '../../../lib/api-client';
import { Hero } from '../../../components/Hero';
import { ProductGrid } from '../../../components/ProductGrid';

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
    const content = await cms.pages.springPage.get();
    return {
        title: content.seo.title,
        description: content.seo.description,
    };
}

export default async function SpringPage() {
    const content = await cms.pages.springPage.get();
    const featured = inStoredOrder(content.featured, await listProducts(), (product) => product.id);

    return (
        <main
            style={{
                padding: '2rem',
                maxWidth: '48rem',
                margin: '0 auto',
            }}>
            <Hero {...content.hero} />
            <ProductGrid products={featured} />
        </main>
    );
}
