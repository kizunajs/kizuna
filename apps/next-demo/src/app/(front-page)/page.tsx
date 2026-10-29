import type { Metadata } from 'next';
import { inStoredOrder } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { apiClient } from '../../lib/api-client';
import { listOf } from '../../lib/stored';
import { Hero } from '../../components/blocks/Hero';
import { Statement } from '../../components/blocks/Statement';
import { Categories } from '../../components/blocks/Categories';
import { Products } from '../../components/blocks/Products';
import { Media } from '../../components/blocks/Media';
import { Content } from '../../components/blocks/Content';
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
    const sections = listOf(content.sections);
    const products = sections.some((section) => section.block === 'products') ? await listProducts() : [];

    return (
        <main>
            <Hero {...content.hero} impact={content.heroImpact} />
            {sections.map((section, index) => {
                switch (section.block) {
                    case 'statement':
                        return <Statement key={index} {...section} />;
                    case 'categories':
                        return <Categories key={index} {...section} />;
                    case 'products':
                        return (
                            <Products
                                key={index}
                                {...section}
                                products={inStoredOrder([...listOf(section.products)], products, (product) => product.id)}
                            />
                        );
                    case 'media':
                        return <Media key={index} {...section} />;
                    case 'content':
                        return <Content key={index} {...section} />;
                    case 'archive':
                        return <Archive key={index} {...section} />;
                    case 'callToAction':
                        return <CallToAction key={index} {...section} />;
                }
            })}
        </main>
    );
}
