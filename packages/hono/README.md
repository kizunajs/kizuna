# @ts-kizuna/hono

`@ts-kizuna/hono` connects a Kizuna API to a Hono application. Hono runs on Cloudflare Workers, Deno, Bun, Node.js, and other runtimes.

**Requires Hono >= 4.**

## Installation

```sh
pnpm add @ts-kizuna/hono hono
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from '@ts-kizuna/core';
import { honoAdapter } from '@ts-kizuna/hono';
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

[Hono adapter](https://ts-kizuna.com/docs/adapters/hono)
