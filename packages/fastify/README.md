# @kizunajs/fastify

`@kizunajs/fastify` connects a Kizuna API to a Fastify application.

**Requires Fastify >= 5.**

## Installation

```sh
pnpm add @kizunajs/fastify fastify
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from 'kizunajs';
import { fastifyAdapter } from '@kizunajs/fastify';
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

[Fastify adapter](https://kizunajs.com/docs/adapters/fastify)
