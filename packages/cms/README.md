# @kizunajs/cms

`@kizunajs/cms` is content for Next.js sites on Kizuna.js: pages and blocks declared with Zod, drafts and publishing in your own database, and editing by clicking on the page or by asking an agent.

## Installation

```sh
pnpm add @kizunajs/cms drizzle-orm
```

## Usage

```ts
// src/app/lp/spring/content.ts
import { z } from 'zod';
import { page } from '@kizunajs/cms';
import { HeroBlockSchema } from '../../../cms/blocks';
import { ProductId, SeoSchema } from '../../../cms/schemas';

export default page({
    name: 'springPage',
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
});
```

```tsx
// src/app/lp/spring/page.tsx
import { cms } from '../../../cms';

export default async function SpringPage() {
    const content = await cms.pages.springPage.get();

    return <Hero {...content.hero} />;
}
```

## Documentation

[CMS](https://kizunajs.com/docs/cms)
