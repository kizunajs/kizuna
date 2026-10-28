import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import { inStoredOrder } from '@kizunajs/cms/next';
import kizuna from '@kizuna-config';
import { apiClient } from '../../lib/api-client';
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
    const products = content.products === undefined ? [] : inStoredOrder(content.products.products, await listProducts(), (product) => product.id);

    // Each section the sidebar lists, once, in its order. A section with no content shows nothing.
    const render: Record<(typeof content.sections)[number], () => ReactNode> = {
        statement: () => (content.statement === undefined ? null : <Statement {...content.statement} />),
        categories: () => (content.categories === undefined ? null : <Categories {...content.categories} />),
        products: () => (content.products === undefined ? null : <Products {...content.products} products={products} />),
        photo: () => (content.photo === undefined ? null : <Media {...content.photo} tone={content.photoTone} />),
        columns: () => (content.columns === undefined ? null : <Content {...content.columns} />),
        articles: () => (content.articles === undefined ? null : <Archive {...content.articles} />),
        callToAction: () => (content.callToAction === undefined ? null : <CallToAction {...content.callToAction} tone={content.callToActionTone} />),
    };

    return (
        <main>
            <Hero {...content.hero} impact={content.heroImpact} />
            {[...new Set(content.sections)].map((section) => (
                <Fragment key={section}>{render[section]()}</Fragment>
            ))}
        </main>
    );
}
