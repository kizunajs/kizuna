---
name: kizuna-cms-relationship
description: Let @kizunajs/cms pages hold things that live outside the CMS, such as products in the app's own API or in Stripe, through a relationship that feeds the editor's picker, with cache invalidation when one changes. Use when a page needs to pick, list or link records the CMS does not store.
---

# Hold records from outside the CMS

A page holds ids of things that live elsewhere, and fetches whatever it shows of them itself. A relationship gives the editor's picker its list, and nothing else: a visitor's page never calls it.

## Steps

1. Give the id a type once, in a shared file: `export const ProductId = Kizuna.brand('ProductId', z.string());`. Name an outside service's ids after it, like `StripeProductId`, so they never pass for the app's own.
2. Use the same id type in the app's own schemas and routes. It is one type on the server and in the generated client, so ids pass straight through.
3. Define the relationship with `defineRelationship({ name, id, options })`, exported in PascalCase. `options` answers `{ id, label, image? }` for each match. It gets `query` when the editor searches and `ids` to name ids a field already holds.
4. For the app's own API, `options` calls a route that selects only the id, label and image, and passes `headers` on, so the route sees the editor and its own `auth` decides. For another service, it calls that service with the app's own key and leaves `headers` alone.
5. List it on `cms({ relationships: [Products] })`.
6. In the page's `content.ts`, hold ids with `z.array(Products.id).max(6)`. In `page.tsx`, fetch the items through the app's client or the service, keeping the stored order with `inStoredOrder`.
7. When an item changes, call `cmsClient.invalidate({ body: { relationship: 'products', id } })` from the route or webhook that changed it. Every page holding that id refreshes, and no other.

## Template

```ts
import { defineRelationship } from '@kizunajs/cms';
import { ProductId } from '../models';
import { apiClient } from '../lib/api-client';

export const Products = defineRelationship({
    name: 'products',
    id: ProductId,
    options: async ({ query, ids, headers }) => {
        const result = await apiClient.products.listProductOptions({
            query: {
                q: query,
                ids,
            },
            headers,
        });
        return result.status === 200 ? result.body.options : [];
    },
});
```

```ts
listProductOptions: k
    .route({
        method: 'GET',
        path: '/product-options',
        auth: 'staff',
        query: z.object({
            q: z.string().optional(),
            ids: z.array(ProductId).optional(),
        }),
        responses: {
            200: z.object({
                options: z.array(
                    z.object({
                        id: ProductId,
                        label: z.string(),
                        image: z.url().optional(),
                    })
                ),
            }),
        },
    })
    .handler(async ({ query }) => ({
        status: 200,
        body: {
            options: await findProductOptions(query),
        },
    })),
```

## Rules

- Store ids, never copies of the item. The CMS never fetches the items for a page.
- The options route reads only what the picker shows.
- A relationship's `name` is camelCase and unique; `invalidate` names it.
- A collection's own ids need no relationship, since the CMS lists its items itself.
- `kizuna cms push` checks every held id against the target's picker list and lists the missing ones.
