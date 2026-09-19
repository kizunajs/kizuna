# @ts-kizuna/openapi

`@ts-kizuna/openapi` generates an OpenAPI 3.1.0 document from your routes, and serves it with a reference UI on any adapter.

## Installation

```sh
pnpm add @ts-kizuna/openapi
```

## Usage

Name the plugin under `plugins` in your config, and `api.mount` serves the document and its reference UI:

```ts
// kizuna.config.ts
import { defineConfig } from '@ts-kizuna/core';
import { expressAdapter } from '@ts-kizuna/express';
import { openApiPlugin } from '@ts-kizuna/openapi';
import { routes } from './src/routes';

export default defineConfig({
    adapter: expressAdapter(),
    routes,
    plugins: [
        openApiPlugin({
            info: {
                title: 'My API',
                version: '1.0.0',
            },
            docsPath: '/docs',
        }),
    ],
});
```

## Documentation

[OpenAPI generation](https://ts-kizuna.com/docs/openapi)
