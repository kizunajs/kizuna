# Kizuna.js

![Kizuna.js](https://raw.githubusercontent.com/kizunajs/kizuna/main/docs/public/readme-beta.png)

A spec-driven framework for building fully typed REST APIs in TypeScript, where your route declarations produce the validation, the documentation, the clients, and the AI tools.

[![npm](https://img.shields.io/npm/v/kizunajs?color=blue&label=npm)](https://www.npmjs.com/package/kizunajs)
![license](https://img.shields.io/badge/license-MIT-blue)

[Documentation](https://kizunajs.com)

> [!NOTE]
> v2 is in beta, so a minor version can carry a breaking change. Every release names them under **⚠ BREAKING CHANGES**, so pin your version and upgrade when it suits you.
>
> [See the release notes](https://github.com/kizunajs/kizuna/releases)

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

Follow the [quickstart](https://kizunajs.com/docs/quickstart), which goes from an empty project to a running route.

## Documentation

- [What is Kizuna](https://kizunajs.com/docs), what you write and what you get
- [Quickstart](https://kizunajs.com/docs/quickstart), install to first route
- [Routes](https://kizunajs.com/docs/routes), methods, paths, schemas and handlers
- [Adapters](https://kizunajs.com/docs/adapters/express), Express, Fastify, Hono and Next.js
- [Clients](https://kizunajs.com/docs/clients/fetch), TypeScript, Swift, Kotlin and TanStack Query
- [CLI](https://kizunajs.com/docs/cli), generate clients and catch breaking changes before they ship
- [Standards](https://kizunajs.com/docs/standards), every RFC it follows

## Packages

| Package                    | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `kizunajs`                 | Route declaration, validation, and the adapter API |
| `@kizunajs/fetch`          | Typed fetch-based client                           |
| `@kizunajs/tanstack-query` | TanStack Query client                              |
| `@kizunajs/express`        | Express adapter                                    |
| `@kizunajs/fastify`        | Fastify adapter                                    |
| `@kizunajs/hono`           | Hono adapter                                       |
| `@kizunajs/next`           | Next.js App Router adapter                         |
| `@kizunajs/openapi`        | OpenAPI generation                                 |
| `@kizunajs/swift`          | Swift client generation                            |
| `@kizunajs/kotlin`         | Kotlin client generation                           |
| `@kizunajs/mcp`            | MCP endpoint for AI assistants                     |
| `@kizunajs/eslint-plugin`  | ESLint rules                                       |
| `@kizunajs/cli`            | Command line tooling                               |

## License

MIT
