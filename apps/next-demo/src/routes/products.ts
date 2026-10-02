import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { k } from '../k';
import { ProductId } from '../cms/schemas';

const ProductSchema = Kizuna.model({
    title: 'Product',
    schema: z.object({
        id: ProductId,
        name: z.string(),
        price: z.number(),
        imageUrl: z.string(),
    }),
});

type Product = z.output<typeof ProductSchema>;

const catalogue = new Map<string, Product>(
    [
        ['prod_tulips', 'Tulip bundle', 12],
        ['prod_daffodils', 'Daffodil box', 9],
        ['prod_hyacinth', 'Hyacinth pot', 14],
        ['prod_seeds', 'Wildflower seeds', 6],
    ].map(([id, name, price]) => [
        String(id),
        {
            id: String(id) as Product['id'],
            name: String(name),
            price: Number(price),
            imageUrl: `https://picsum.photos/seed/${id}/400/300`,
        },
    ])
);

/**
 * Which of the ids exist, for the CMS brand registry and `kizuna cms push`.
 */
export const findExistingProductIds = (ids: readonly string[]): string[] => ids.filter((id) => catalogue.has(id));

export const products = k.routes({
    listProducts: k
        .route({
            method: 'GET',
            path: '/products',
            auth: false,
            summary: 'List products, optionally matching a search',
            tool: true,
            query: z.object({
                q: z.string().optional(),
            }),
            responses: {
                200: z.object({
                    products: z.array(ProductSchema),
                }),
            },
        })
        .handler(({ query }) => ({
            status: 200,
            body: {
                products: [...catalogue.values()].filter(
                    (product) => query.q === undefined || product.name.toLowerCase().includes(query.q.toLowerCase())
                ),
            },
        })),
    getProduct: k
        .route({
            method: 'GET',
            path: '/products/:id',
            auth: ['site', 'editor'],
            summary: 'Read one product, as the site or an editor',
            pathParams: z.object({
                id: ProductId,
            }),
            responses: {
                200: ProductSchema,
            },
        })
        .handler(({ params, throwError }) => {
            const product = catalogue.get(params.id);
            if (product === undefined) {
                return throwError({
                    status: 403,
                    body: {
                        detail: 'No such product.',
                    },
                });
            }
            return {
                status: 200,
                body: product,
            };
        }),
    updateProduct: k
        .route({
            method: 'PATCH',
            path: '/products/:id',
            auth: {
                identity: 'editor',
                roles: 'admin',
            },
            summary: 'Rename a product and refresh every page featuring it',
            pathParams: z.object({
                id: ProductId,
            }),
            body: z.object({
                name: z.string().min(1),
            }),
            responses: {
                200: ProductSchema,
            },
        })
        .handler(async ({ params, body, plugins, throwError }) => {
            const product = catalogue.get(params.id);
            if (product === undefined) {
                return throwError({
                    status: 403,
                    body: {
                        detail: 'No such product.',
                    },
                });
            }
            const updated = {
                ...product,
                name: body.name,
            };
            catalogue.set(params.id, updated);
            await plugins.cms.invalidate(ProductId, params.id);
            return {
                status: 200,
                body: updated,
            };
        }),
});
