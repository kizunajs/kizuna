# @ts-kizuna/next

`@ts-kizuna/next` connects a ts-kizuna API to the Next.js App Router, as a catch-all route handler.

**Requires Next.js >= 16.**

## Installation

```sh
pnpm add @ts-kizuna/next
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from '@ts-kizuna/core';
import { nextAdapter } from '@ts-kizuna/next';
import { routes } from './src/routes';

export default defineConfig({
    adapter: nextAdapter(),
    routes,
});
```

Export the handlers from a catch-all route:

```ts
// src/app/api/[...ts-kizuna]/route.ts
import kizuna from '../../../../kizuna.config';

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = kizuna.api.mount({
    basePath: '/api',
});
```

## Documentation

[Next.js adapter](https://ts-kizuna.com/docs/adapters/next)
