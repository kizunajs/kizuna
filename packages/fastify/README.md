# @ts-kizuna/fastify

`@ts-kizuna/fastify` connects a ts-kizuna API to a Fastify application.

**Requires Fastify >= 5.**

## Installation

```sh
pnpm add @ts-kizuna/fastify fastify
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from '@ts-kizuna/core';
import { fastifyAdapter } from '@ts-kizuna/fastify';
import { routes } from './src/routes';

export default defineConfig({
    adapter: fastifyAdapter(),
    routes,
});
```

```ts
// src/index.ts
import Fastify from 'fastify';
import kizuna from '../kizuna.config';

const app = Fastify();

await kizuna.api.mount(app);

app.listen({
    port: 3000,
});
```

## Documentation

[Fastify adapter](https://ts-kizuna.com/docs/adapters/fastify)
