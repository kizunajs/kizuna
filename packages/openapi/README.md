# @kizunajs/openapi

`@kizunajs/openapi` generates an OpenAPI 3.1.0 document from your routes, and serves it with a reference UI on any adapter.

## Installation

```sh
pnpm add @kizunajs/openapi
```

## Usage

Name the plugin under `plugins` in your config, and `api.mount` serves the document and its reference UI:

```ts
// kizuna.config.ts
import { defineConfig } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { openApiPlugin } from '@kizunajs/openapi';
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

[OpenAPI generation](https://kizunajs.com/docs/openapi)
