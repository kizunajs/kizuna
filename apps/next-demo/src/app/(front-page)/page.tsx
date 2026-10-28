import type { Metadata } from 'next';
import { inStoredOrder } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { apiClient } from '../../lib/api-client';
import { Hero } from '../../components/blocks/Hero';
import { Content } from '../../components/blocks/Content';
import { Products } from '../../components/blocks/Products';
import { Media } from '../../components/blocks/Media';
import { Archive } from '../../components/blocks/Archive';
import { CallToAction } from '../../components/blocks/CallToAction';

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
    const content = await kizuna.content.pages.frontPage.get();
    return {
        title: {
            absolute: content.seo.title,
        },
        description: content.seo.description,
    };
}

export default async function FrontPage() {
    const content = await kizuna.content.pages.frontPage.get();
    const products = inStoredOrder(content.shop.products, await listProducts(), (product) => product.id);

    return (
        <main>
            <Hero {...content.hero} />
            {content.intro === undefined ? null : <Content {...content.intro} />}
            <Products heading={content.shop.heading} products={products} />
            {content.media === undefined ? null : <Media {...content.media} />}
            <Archive {...content.latest} />
            {content.callToAction === undefined ? null : <CallToAction {...content.callToAction} />}
        </main>
    );
}
