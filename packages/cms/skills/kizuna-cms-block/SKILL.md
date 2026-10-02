---
name: kizuna-cms-block
description: Define a reusable content block for @kizunajs/cms with block(), and the shared Zod schemas pages and blocks are built from. Use when several pages share a section such as a hero, a call to action or SEO fields, or when a designer's limits need one home.
---

# Define a block and shared schemas

A block is a group of fields several pages use as one field. `defineBlock()` returns a plain Zod object schema, so a page takes it wherever it takes a schema, and the block's own field rules and descriptions apply inside it.

## Where things live

- `cms/schemas.ts`: shared Zod schemas with their limits and `.describe()` text. `HeadingSchema`, `CtaSchema`, `SeoSchema`, branded ids like `ProductId`.
- `cms/blocks.ts`: blocks built from them with `defineBlock()`.
- `components/`: one component per block, typed with `Output<typeof HeroBlockSchema>`.

## Steps

1. Put each limit in a shared schema once, with `.describe()` saying what the designer wants: `z.string().min(1).max(60).describe('Under 8 words.')`.
2. Define the block with a kebab-case `slug` and inline `fields`. Each field is `{ name, schema, description?, auth?, readOnly? }`.
3. Use `ImageSchema` from `@kizunajs/cms/schemas` for images. It stores a media id with the crop, focal point and alt text for that use; the component receives `{ id, url, alt, width, height }`.
4. Write the component against `Output<typeof HeroBlockSchema>` and render strings as text.
5. Reference the block from a page field: `{ name: 'hero', schema: HeroBlockSchema }`.

## Template

```ts
import { z } from 'zod';
import { defineBlock } from '@kizunajs/cms';
import { ImageSchema } from '@kizunajs/cms/schemas';
import { CtaSchema, HeadingSchema } from './schemas';

export const HeroBlockSchema = defineBlock({
    slug: 'hero',
    fields: [
        {
            name: 'heading',
            schema: HeadingSchema,
        },
        {
            name: 'subheading',
            schema: z.string().max(200).describe('One sentence under the heading.'),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
        {
            name: 'cta',
            schema: CtaSchema,
        },
    ],
});
```

```tsx
import type { Output } from '@kizunajs/cms';
import type { HeroBlockSchema } from '../cms/blocks';

export function Hero(props: Output<typeof HeroBlockSchema>) {
    return (
        <section>
            {props.image !== undefined ? (
                <img src={props.image.url} alt={props.image.alt} width={props.image.width} height={props.image.height} />
            ) : null}
            <h1>{props.heading}</h1>
            <p>{props.subheading}</p>
            <a href={props.cta.href}>{props.cta.label}</a>
        </section>
    );
}
```

## Rules

- Zod is the only schema language. No custom field types, no wrapper builders, no `.meta()` for CMS rules.
- A field's `description` overrides the schema's `.describe()` for that one use.
- No `as const`. No one-line objects. Schemas end in `Schema`.
- A block never knows which page holds it. Page-specific rules, such as `auth`, go on the page's field.
