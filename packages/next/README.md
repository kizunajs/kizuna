# @kizunajs/next

`@kizunajs/next` connects a Kizuna API to the Next.js App Router, as a catch-all route handler.

**Requires Next.js >= 16.**

## Installation

```sh
pnpm add @kizunajs/next
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from 'kizunajs';
import { nextAdapter } from '@kizunajs/next';
import { routes } from './src/routes';

export default defineConfig({
    adapter: nextAdapter(),
    routes,
});
```

Export the handlers from a catch-all route:

```ts
// src/app/api/[...kizuna]/route.ts
import kizuna from '../../../../kizuna.config';

export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } = kizuna.api.mount({
    basePath: '/api',
});
```

## Documentation

[Next.js adapter](https://kizunajs.com/docs/adapters/next)
