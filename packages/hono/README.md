# @kizunajs/hono

`@kizunajs/hono` connects a Kizuna API to a Hono application. Hono runs on Cloudflare Workers, Deno, Bun, Node.js, and other runtimes.

**Requires Hono >= 4.**

## Installation

```sh
pnpm add @kizunajs/hono hono
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from 'kizunajs';
import { honoAdapter } from '@kizunajs/hono';
import { routes } from './src/routes';

export default defineConfig({
    adapter: honoAdapter(),
    routes,
});
```

```ts
// src/index.ts
import { Hono } from 'hono';
import kizuna from '../kizuna.config';

const app = new Hono();

kizuna.api.mount(app);

export default app;
```

## Documentation

[Hono adapter](https://kizunajs.com/docs/adapters/hono)
