# @kizunajs/cms

`@kizunajs/cms` is content for Next.js sites on Kizuna.js: pages, globals and collections declared with Zod, drafts and publishing in your own database, and editing in your chat, where Claude or another MCP host shows the editor beside the answer.

## Installation

```sh
pnpm add @kizunajs/cms drizzle-orm
```

## Usage

```ts
// src/app/(front-page)/content.ts
import { z } from 'zod';
import { definePage } from '@kizunajs/cms';

export default definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
        },
        {
            name: 'intro',
            schema: z.string().max(400),
        },
    ],
});
```

```ts
// kizuna.config.ts
content: cms({
    db,
    pages,
    auth: {
        identity: 'editor',
    },
}),
```

```tsx
// src/app/(front-page)/page.tsx
import kizuna from '@kizuna-config';

export default async function FrontPage() {
    const content = await kizuna.content.pages.frontPage.get();

    return <h1>{content.heading}</h1>;
}
```

## Documentation

[CMS](https://kizunajs.com/docs/cms)
