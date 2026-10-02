---
name: kizuna-cms-page
description: Add an editable page to a Next.js site that uses @kizunajs/cms. Use when asked to make a page's copy, images, product picks or SEO text editable, or to add a new content.ts beside a route.
---

# Add a CMS page

A page declares its editable fields in a `content.ts` beside its `page.tsx`. The CMS discovers the file, stores the content in the app's database, and the page component reads it typed.

## Steps

1. Find the route folder under `app/` (or `src/app/`). The page's URL comes from the folder, so `src/app/pricing/content.ts` is served at `/pricing`, and `src/app/(front-page)/content.ts` at `/`, since a route group adds nothing to the path.
2. Create `content.ts` with a default export of `definePage({ name, fields })`. The name is camelCase with a `Page` suffix and unique across the site. Write it as a string literal; discovery reads it from the source.
3. Declare every field inline in `fields`, once: `{ name, schema, description?, auth?, readOnly? }`. Every schema is plain Zod. Reuse shared schemas from the project's `cms/schemas.ts` or blocks from `cms/blocks.ts` instead of repeating limits.
4. Put design rules in the schema: `.max()` on text, `.min()` and `.max()` on arrays, `z.enum()` for variants, `.describe()` for guidance such as `'Under 8 words.'`. Links are `z.url({ protocol: /^https$/ })`.
5. Reference app data with a branded id schema (`z.array(ProductId).max(6)`), never a copied object. The page fetches the items itself.
6. Fields only some editors may change take `auth: { roles: 'admin' }`, using a role the editor identity declares. Fields nobody edits take `readOnly: true`.
7. Formatted text, like an article body, is `RichTextSchema` from `@kizunajs/cms/schemas`. Render it with `<RichText value={content.body} />` from `@kizunajs/cms/next`, never as HTML.
8. Read the content in `page.tsx` with `await cms.pages.<name>.get()` and pass it to components. Never pass a CMS string to `dangerouslySetInnerHTML`.
9. Run `kizuna generate`. It rewrites `cms.pages.ts` and fails on a duplicate page name. Run `kizuna generate --check` to confirm nothing is behind.

## Template

```ts
import { z } from 'zod';
import { definePage } from '@kizunajs/cms';
import { HeroBlockSchema } from '../../cms/blocks';
import { ProductId, SeoSchema } from '../../cms/schemas';

export default definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'hero',
            schema: HeroBlockSchema,
        },
        {
            name: 'featured',
            schema: z.array(ProductId).max(6),
            description: 'Products shown in the grid, in this order. Up to six.',
        },
        {
            name: 'seo',
            schema: SeoSchema,
            auth: {
                roles: 'admin',
            },
        },
    ],
    labels: {
        featured: 'Featured products',
    },
});
```

```tsx
import { inStoredOrder } from '@kizunajs/cms/next';
import { cms } from '../../cms';

export default async function FrontPage() {
    const content = await cms.pages.frontPage.get();
    const result = await apiClient.products.listProducts({
        query: {},
    });
    const featured = inStoredOrder(content.featured, result.status === 200 ? result.body.products : [], (product) => product.id);

    return (
        <main>
            <Hero {...content.hero} />
            <ProductGrid products={featured} />
        </main>
    );
}
```

## A route with a param

Content with many entries, like blog articles, is a collection; see `defineCollection`. The route at `app/blog/[slug]` shows one article per address with a `content.ts` that names the collection instead of fields:

```ts
import { definePage } from '@kizunajs/cms';
import { articles } from '../../../cms/content';

export default definePage({
    name: 'articlePage',
    collection: articles,
});
```

Each route param must name a text field of the collection, here `slug`, and the collection goes in `cmsPlugin({ collections })`. Read the article with `await cms.pages.articlePage.get(await params)`, and list articles with `cms.collections.articles.list()`.

## Adding a field to an existing page

A new field needs a `.default()` on its schema, or a `migrate` step keyed by the next version number that fills it from the stored document. Without one, stored content fails the schema and `kizuna diff` fails CI.

```ts
migrate: {
    1: (document) => ({
        ...document,
        subheading: '',
    }),
},
```

## Rules

- No `as const` anywhere. `definePage()` and `defineBlock()` infer literal types on their own.
- Every object and array on multiple lines, every property on its own line.
- Zod schemas end in `Schema`, page names end in `Page`.
- Fields are listed once, in `fields`. There is no separate schema to keep in sync.
- Do not add an `initial` or default content option. Content lives in the database; the setup screen and the agent fill a new page in.
