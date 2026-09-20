# ts-kizuna

![ts-kizuna](https://raw.githubusercontent.com/ts-kizuna/kizuna/main/docs/public/readme-beta.png)

Build fully typed REST APIs with TypeScript. Declare a route once. Get a typed server, an OpenAPI spec, Swift and Kotlin clients, and more.

[![npm](https://img.shields.io/npm/v/@ts-kizuna/core?color=blue&label=npm)](https://www.npmjs.com/package/@ts-kizuna/core)
![license](https://img.shields.io/badge/license-MIT-blue)

[Documentation](https://ts-kizuna.com)

> [!NOTE]
> **Why is it already 1.0 if it's in beta?** We built ts-kizuna for our own apps and have been battle-testing it in production since before we open-sourced it. The version number came with it from that internal history, so read it as 0.x. It's labeled beta because the syntax for how you declare routes, handlers, and clients may still change before v2.
>
> So a minor version can carry a breaking change while ts-kizuna is in beta. Every release names them under **⚠ BREAKING CHANGES**, so pin your version and upgrade when it suits you.
>
> [See the release notes](https://github.com/ts-kizuna/kizuna/releases)

## Features

- **One declaration**: a method, a path, its schemas and the handler that answers it, in one place
- **Type-safe everywhere**: full inference on both sides, no casting
- **Typed authentication**: identities carrying their own guard, roles, and an `auth` on every route
- **RPC-like client**: call your API like a function, get fully typed responses back
- **Streaming**: stream an AI reply as typed events, yielded from the handler and read with `for await` in the client
- **Tools**: add `tool: true` on a route and an AI assistant can call it, through the same handler, guards and validation
- **Caching**: declare a cache policy on a response and every adapter sends `Cache-Control` and `Vary`
- **TanStack Query**: typed query and mutation options with caching and invalidation
- **Adapters**: mount your API on Express, Fastify, Hono, or Next.js
- **HTTP/REST**: follows HTTP and REST standards. RFC 9110 semantics, RFC 9457 Problem Details
- **Built-in coercion**: query, path, and header params are coerced to their declared types (`z.number()`, `z.boolean()`, `z.date()`, `z.bigint()`), with no manual parsing or `z.coerce` needed
- **OpenAPI generation**: from the same routes, no annotations needed
- **Native client generation**: typed API clients for Swift (iOS/macOS) and Kotlin (Android/JVM)
- **Plugins**: extend your API with features built on the routes you already wrote, and get them fully typed in your handlers
- **MCP endpoint**: serve the routes declaring a tool so AI assistants can call them, behind the same guards
- **Scheduled jobs**: declare cron work next to its handler, tick it from any platform scheduler, or run it in process from a route handler
- **Deprecation and sunset support**: deprecate routes and fields, and it shows up in your editor, OpenAPI, Swift, Kotlin, and the response headers

## Getting started

### Declare your routes

Export a `k` instance once, typed by the `Config` generated from your config.

```ts
// src/k.ts
import { Kizuna } from '@ts-kizuna/core';
import type { Config } from '../kizuna.types';

export const k = new Kizuna<Config>();
```

Then declare each route: a method, a path, Zod schemas, and the handler that answers it.

```ts
// src/routes/users.ts
import { z } from 'zod';
import { ProblemDetailsSchema } from '@ts-kizuna/core/schemas';
import { k } from '../k';

export const users = k.routes({
    getUser: k
        .route({
            method: 'GET',
            path: '/users/:id',
            responses: {
                200: z.object({
                    id: z.string(),
                    name: z.string(),
                }),
                404: ProblemDetailsSchema,
            },
        })
        .handler(async ({ params }) => {
            const user = await db.users.findById(params.id);
            if (!user) {
                return {
                    status: 404,
                    body: {
                        detail: 'Not found',
                    },
                };
            }
            return {
                status: 200,
                body: user,
            };
        }),
});
```

### Assemble it

Name your framework and your routes. The adapter decides what handlers get alongside their inputs.

```ts
// kizuna.config.ts
import { defineConfig } from '@ts-kizuna/core';
import { expressAdapter } from '@ts-kizuna/express'; // or any other adapter
import { users } from './src/routes/users';

export default defineConfig({
    adapter: expressAdapter(),
    routes: {
        users,
    },
});
```

### Mount it on your app

```ts
// src/index.ts
import express from 'express';
import kizuna from '../kizuna.config';

const app = express();
app.use(express.json());

kizuna.api.mount(app);
app.listen(3000);
```

### Use the API on the client

Name a client under `clients` on your config, run `kizuna generate`, and the file it writes already knows every route.

```ts
// src/lib/api-client.ts
import { createClient } from './api-client.generated';

const client = createClient({
    baseUrl: 'http://localhost:3000',
});

const result = await client.users.getUser({
    params: {
        id: '1',
    },
});

if (result.status === 200) {
    result.body; // { id: string; name: string }
}
```

[Read the full docs](https://ts-kizuna.com/docs)

## Packages

| Package                        | Description                                        |
| ------------------------------ | -------------------------------------------------- |
| `@ts-kizuna/core`              | Route declaration, validation, and the adapter API |
| `@ts-kizuna/fetch`             | Typed fetch-based client                           |
| `@ts-kizuna/tanstack-query`    | TanStack Query client                              |
| `@ts-kizuna/express`           | Express adapter                                    |
| `@ts-kizuna/fastify`           | Fastify adapter                                    |
| `@ts-kizuna/hono`              | Hono adapter                                       |
| `@ts-kizuna/next`              | Next.js App Router adapter                         |
| `@ts-kizuna/openapi`           | OpenAPI generation                                 |
| `@ts-kizuna/swift`             | Swift client generation                            |
| `@ts-kizuna/kotlin`            | Kotlin client generation                           |
| `@ts-kizuna/mcp`               | MCP endpoint for AI assistants                     |
| `@ts-kizuna/eslint-plugin`     | ESLint rules                                       |
| `@ts-kizuna/typescript-plugin` | Deprecation highlighting in the editor             |
| `@ts-kizuna/cli`               | Command line tooling                               |

## License

MIT
