---
name: kizuna-cms-brand
description: Let @kizunajs/cms pages reference app data such as products or authors through a Kizuna.brand id, with a search route for the picker and the agent, an existence check for kizuna cms push, and cache invalidation from the route that changes the item. Use when a page needs to pick, list or link app records.
---

# Reference app data from a page

The CMS has no relationship concept. Any `Kizuna.brand` id inside a page is a reference: it is stored as a plain id, indexed for where-used, and the page fetches the item itself through the app's routes.

## Steps

1. Brand the id once, in a shared schema file: `export const ProductId = Kizuna.brand('ProductId', z.string());`. Brand names are unique across the app; prefix an outside service's ids, like `ShopifyProductId`.
2. Use the brand in the app's own schemas and routes, so the API and the CMS agree on the type.
3. Give the CMS a search route marked `tool: true`, which powers the picker and tells the agent where to find ids. It takes an optional `q` query and returns the items in an array.
4. Register the brand on `cmsPlugin({ brands })` with `search`, `label`, `image` and `exists`. All four are optional; without `search` the field gets a plain id input, and without `exists` the push check skips the brand with a warning.
5. In the route or webhook that changes an item, call `plugins.cms.invalidate(ProductId, id)`. It refreshes every page holding that id and no other.
6. In the page, store ids with `z.array(ProductId).max(6)` and fetch with the generated client, keeping the stored order with `inStoredOrder`.

## Template

```ts
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
                products: findProducts(query),
            },
        })),
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
        .handler(async ({ params, body, plugins }) => {
            const product = await renameProduct(params.id, body.name);
            await plugins.cms.invalidate(ProductId, params.id);
            return {
                status: 200,
                body: product,
            };
        }),
});
```

```ts
cmsPlugin({
    db,
    pages,
    auth: {
        identity: 'editor',
        roles: ['editor', 'admin'],
    },
    brands: {
        ProductId: {
            search: products.listProducts,
            label: (product) => product.name,
            image: (product) => product.imageUrl,
            exists: findExistingProductIds,
        },
    },
}),
```

## Rules

- Store ids, never copies of the item. The CMS never fetches referenced data.
- The search route is an ordinary route of the app, with `tool: true` and a `summary`.
- `invalidate` takes the brand schema or its name, and the id.
- `kizuna cms push` checks every branded id with `exists` and lists the missing ones instead of keeping them silently.
