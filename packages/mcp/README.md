# @kizunajs/mcp

`@kizunajs/mcp` adds an MCP (Model Context Protocol) endpoint to your API. The tools you declare, and the routes you choose to publish, become tools that AI assistants can discover and call.

## Installation

```sh
pnpm add @kizunajs/mcp
```

## Usage

Name the plugin under `plugins` in your config, and `api.mount` serves the endpoint:

```ts
// kizuna.config.ts
import { defineConfig } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { mcpPlugin } from '@kizunajs/mcp';
import { routes } from './src/routes';

export default defineConfig({
    adapter: expressAdapter(),
    routes,
    plugins: [
        mcpPlugin({
            name: 'My API',
        }),
    ],
});
```

Which routes a model may call is each route's own business: declare `tool` on the ones worth publishing.

```ts
getForecast: k
    .route({
        method: 'GET',
        path: '/forecast/:city',
        summary: 'Look up tomorrow forecast for one city',
        tool: true,
        responses: {
            200: ForecastSchema,
        },
    })
    .handler(/* ... */),
```

## Documentation

[MCP](https://kizunajs.com/docs/mcp)
