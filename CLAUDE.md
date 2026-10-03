# Philosophy

Kizuna is an HTTP and OpenAPI spec-driven library. It follows the relevant RFCs and OpenAPI best practices strictly, not for convenience, not for ergonomics. When in doubt, follow the spec.

## Specs

- **RFC 9110** (HTTP Semantics, June 2022): methods, status codes, headers, content negotiation
- **RFC 5789** (PATCH Method, April 2010): PATCH semantics
- **RFC 9457** (Problem Details for HTTP APIs, July 2023): error response bodies
- **RFC 3986** (URI Syntax, January 2005): paths match exactly, so `/users/1` and `/users/1/` differ
- **RFC 8594** (Sunset HTTP Header, May 2019): the `Sunset` response header and the `sunset` link relation on routes with a `sunset` date
- **RFC 9745** (Deprecation HTTP Header, March 2025): the `Deprecation` response header and the `deprecation` link relation on routes with a deprecation date
- **Server-sent events** (WHATWG HTML Living Standard): the `text/event-stream` framing of a route's `stream` response, its `event`, `data`, `id`, and `retry` fields, and comment lines
- **RFC 9111** (HTTP Caching, June 2022): the `Cache-Control` and `Vary` response headers a response's `cache` policy sends
- **RFC 5861** (Stale Content, May 2010): the `stale-while-revalidate` and `stale-if-error` cache directives
- **RFC 8246** (Immutable Responses, September 2017): the `immutable` cache directive
- **RFC 9110** (Conditional Requests, June 2022): the `ETag` a response's `etag` sends, the `If-None-Match` it is compared against, and the `304 Not Modified` a match answers with
- **OpenAPI 3.1.0**: spec generation
- **OAuth 2.1**: the resource server model, for an API that verifies tokens rather than issuing them
- **RFC 9728** (OAuth 2.0 Protected Resource Metadata, April 2025): the discovery document
- **RFC 8414** (OAuth 2.0 Authorization Server Metadata, June 2018): an identity's `issuer`
- **RFC 8707** (Resource Indicators for OAuth 2.0, February 2020): the canonical `resource` URI and the audience a guard checks
- **RFC 6750** (OAuth 2.0 Bearer Token Usage, October 2012): the `WWW-Authenticate` challenge, including `insufficient_scope`
- **Model Context Protocol**: the MCP endpoint, its tools, their names, and its authorization. A route's `tool` follows the `Tool` object field for field
- **MCP Apps** (`io.modelcontextprotocol/ui`, spec 2026-01-26): a tool's `ui` view, served as a `ui://` resource of type `text/html;profile=mcp-app`, and its `visibility`

### MCP tool names

`users.getUser` publishes as `users_get_user`. The [spec](https://modelcontextprotocol.io/specification/latest/server/tools) allows the dot, but Claude Code rewrites it to `_` before the model sees the name, so publishing the dot means the tool is called something kizuna never chose.

### Derived HEAD

Every GET route answers HEAD (RFC 9110 section 9.3.2): same status and headers, `Content-Length`, no body. A declared HEAD route takes the path instead, and HEAD joins GET in every `Allow` header. The derived route stays out of the OpenAPI document and the clients; the generator's `derivedHead` option opts it in. Express, Fastify, and Hono discard HEAD content themselves; Next passes the request method to `renderJsonResult`, which strips it.

### Deliberate omissions

- **TRACE**: excluded from `Method`. Universally disabled in production and unsupported by modern frameworks. Do not add it.
- **Standard Schema**: contracts accept Zod schemas alone. The generators read metadata, JSON Schema conversion, and schema internals the interface does not expose, and supporting every validator would mean rebuilding them per library. Do not add it.

# Jobs

Jobs (`k.jobs`) are the one non-HTTP-shaped concept. Settled; don't relitigate.

- A job is a sibling of a route, never inside one. Nothing that walks `api.routes` sees a job.
- A handler receives `input`, `throwError`, `jobs` and `plugins`. Anything more it imports, as a route handler would.
- A job declares no path and no method. `schedule` is optional.
- A config that declares jobs names `jobRunner.mode`, required, so how they run is never a default.
- `mode: 'http'` serves two endpoints, both under the `jobRunner.path` namespace (default `/jobs`, which serves nothing itself): `POST /jobs/dispatch` runs whatever is due, `POST /jobs/run` runs the one job its `{ job, input }` body names. The jobs' identity guards both, and jobs without one make `defineConfig` throw. A job is addressed by its dotted key.
- `mode: 'in-process'` mounts neither, for a long-running server whose schedules `startJobs` ticks. Jobs there need no identity.
- `run` and `queue`, never a bare call. `run` takes the input; `queue` takes a message (`input`, `runAt`, `dedupeKey`).

Deliberate omissions: no first-party transports, no stored state, and no per-job cron generation. Retries, deduplication, and run history belong to the transport. An occurrence's dedupe key is `job@occurrenceISO`.

# Content

`content` on `defineConfig` takes a content provider, and `cms()` from `@kizunajs/cms` is the one Kizuna ships. Settled; don't relitigate.

- The CMS is not a plugin. Its routes join the API's own in three groups: `content` for anyone reading published content, `editing` for editors and their agents, and `invalidate` for the app. They reach the clients, OpenAPI and MCP like any route, and an app route group with one of those names makes `defineConfig` throw.
- Core owns a small contract in `content.ts`: the provider's documents (ref, kind, name, schema, latest migrate step), which the snapshot records and `kizuna diff` compares, and the reader `defineConfig` hands back as `kizuna.content`. A `published` event waits for its first listener.
- The adapter supplies the runtime the reader needs: a tagged cache, revalidation, draft mode, cookies and not-found. `nextAdapter()` does, importing Next only when called so the CLI can load the config. Without a runtime, reads go uncached.
- The CMS API serves draft mode itself at `/draft`, behind the editor identity, and sends a signed-out editor to `signInPath`. Drafts show only while a signed preview cookie verifies, and the preview renews it.
- Things that live outside the CMS are relationships, made with `defineRelationship`. A page holds their ids and fetches what it shows of them; `options` feeds only the editor's picker, as the editor. The CMS does not edit them.
- Globals, collections and relationships are exported in PascalCase, `Articles`, with a camelCase `name`, `articles`. Blocks take `name` like the rest.
- Model names keep the `Cms` prefix, since Zod's global registry is shared by every config in one process.

# Tools

A tool is a route a model may call. Settled; don't relitigate.

- A tool is not a second kind of declaration. A route says `tool` and it publishes, so there is one place a route runs whoever asked.
- `tool: true` takes the route's `summary` as what a model reads, so a route that publishes carries one. The object form's fields are MCP's own, field for field: `description`, `title`, `readOnlyHint`, `idempotentHint`, `destructiveHint`, `openWorldHint`.
- `needsApproval` is kizuna's own, the one field MCP cannot declare: the person approves each call before it runs. It is a boolean. A rule that depends on the input belongs in the handler.
- `ui` names a view built with `defineView`, and `visibility` says who may call the tool, both MCP Apps' own. A view is self-contained HTML the MCP endpoint serves as a resource. A tool only a view calls says `visibility: ['app']`, and a stream cannot name it.
- The hints default from the method's RFC 9110 semantics. Declare one only to say what the method cannot.
- A tool is addressed by its dotted key, `weather.getForecast`, and publishes as `weather_get_forecast`.
- A route that streams, or that takes a form body, never publishes: a tool result is one value and tool input is JSON.
- A `hidden` route never publishes, and `defineConfig` throws when one declares `tool`.
- A streamed response names routes under `tools`, adding `tool_call`, `tool_result` and `tool_error` to the events it declares. Every route it names declares `tool`.
- Its handler receives `tools`: `definitions` for the model, and `run`, which runs a call as the caller. The body delegates to it with `yield*`.
- On a stream, a call that needs approval returns `needs-approval` and runs nothing. The client sends the call back as a `ToolAnswer`, and the handler runs `run(answer.call, answer)`.
- `readToolCalls` folds a message list into one row per call. Core exports it; the Swift and Kotlin generators emit it per route.

Deliberate omissions: no LLM clients, no agent loop, no provider wire shapes, and no progressive tool input.

# Naming

Use full English words.

- No single-letter names (`u`, `x`, `s`, `r`, `v`, `i`). Use `user`, `candidate`, `server`, `result`, `value`, `index`.
- No truncated abbreviations (`idx`, `cfg`, `usr`). Spell it out.
- Name callback parameters after what they represent: `users.find((candidate) => ...)`.

Exceptions: `_` for unused, `req`/`res`/`next` in Express handlers, `_`-prefixed unused params, and namespace tokens (`k`, `z`).

# Object literals

Always multi-line. Every property on its own line, every nested object expanded, even single-property ones.

```ts
// no
client.getUser({ params: { id: '1' } });
client.getUser({
    params: { id: '1' },
});

// yes
client.getUser({
    params: {
        id: '1',
    },
});
```

# JSDoc

Always multi-line. `/**` on its own line, content on its own line(s), `*/` on its own line, even for one-liners.

```ts
// no
/** Return an `AdapterResult` to override the default outcome. */
onError?: (...) => ...;

// yes
/**
 * Return an `AdapterResult` to override the default outcome.
 */
onError?: (...) => ...;
```

# Git

Never add `Co-Authored-By` trailers for AI agents (Claude, Copilot, Cursor, etc.) to commit messages. AI is a tool, not an author.

# Writing

Applies equally to docs pages, README, JSDoc, and code comments.

- **Plain over clever.** If a sentence has to be decoded, it is wrong. A reader should never have to supply the meaning of your metaphor.
- **Say the concrete thing.** "Swift and Kotlin clients" rather than "native clients". Name what the reader gets, not the category it belongs to.
- **Prefer commas and full stops over em dashes.** An em dash rarely earns the interruption it creates. Where a sentence needs a break, use a comma or start a new sentence, not a semicolon.
- **One idea per example.** A snippet that demonstrates two things teaches neither. Split it.
- **Stop when it is said.** No filler ("simply", "seamlessly", "powerful", "just"), no restating the previous sentence, no explaining what the reader already worked out.
- **Never define a thing by what it is not.** "It is not a wrapper, it is a contract", "an alternative rather than a rewrite", "this is not about performance". Naming the thing you did not mean forces the reader to hold two ideas to arrive at one. Say the thing.

# Comments

Examples in comments and JSDoc use names from this repo's own contract (`UserSchema`, `createUser`, `listEvents`, etc.), not from consumer projects.

# Adapters

First-party adapters (in `packages/`) always ship with:

- **Demo app**: a working example app in `apps/` (e.g. `apps/express-demo`, `apps/hono-demo`)
- **Documentation**: an adapter page in `docs/content/docs/adapters/`, plus updates to every doc page that lists adapters
- **Shared suites**: a `testAdapterFeatures(...)` call in its `*.test.ts` and a `checkAdapterTypeFeatures(...)` call in its `*.test-d.ts`, both from `packages/core/src/adapter-testing/`. Both catalogues are exhaustive, so adding a feature to either one breaks every adapter until each answers it. Legitimate framework differences belong in `ADAPTER_BEHAVIOUR` or in a plain `test()` beside the catalogue call, never silently dropped.

# Plugins

A plugin is one module, built with `definePlugin` from `kizunajs/plugin`. It is named under `plugins` on `defineConfig`, as a list, and a config never reaches a browser, so a plugin may import anything a handler may.

- `slug` is what handlers reach it under, `plugins.<slug>`. The app can pass another one, `emailPlugin({ slug: 'mail' })`, and two plugins on one slug make `defineConfig` throw.
- `options` is a Zod schema. The app's options are validated once, when the config assembles, and a failure names the plugin and the field.
- `setup({ options, api })` runs once, including during `kizuna generate`, and returns `exports`, `routes`, `generators` and `validate`, all optional. `api` is readable from handlers and `validate`, never during `setup` itself.
- `exports` reach every route and job handler at `plugins.<slug>`.
- `routes` are for outside callers, like a webhook, declared with the plugin's own `route(...).handler(...)`. Every plugin route is `hidden`, so none reaches the generated clients, the OpenAPI document or MCP, and one declaring `tool` makes `defineConfig` throw. A plugin route answers with `rawResponse` when its wire format is not a JSON body. Ordinary route handlers cannot.
- `basePath` is where a plugin with several routes serves them. Each route's `path` is relative to it, a route at `/` serves the base path itself, and the app can pass another one at install. A plugin with one route, like MCP, takes a `path` option instead.
- A plugin that runs functions the app writes, like webhook event handlers, takes them as an option and hands them `jobs` and `plugins`. `ApiContext<Config>` types those from the app's `Config`, passed as a type parameter the way `new Kizuna<Config>()` takes it. There is no global registry, since a repo can hold several generated `Config`s in one program.
- `generators` are files `kizuna generate` writes and `--check` compares, built with `defineGenerator`. There is no `generators` key on the config.
- Plugins declare no jobs, no hooks, and never call each other in this phase.

`hidden: true` on any route keeps it out of the Swift, Kotlin and fetch clients, the OpenAPI document (unless `includeHidden`) and MCP. `kizuna routes` still lists it, and the snapshot records it.

Every export subpath of every package under `packages/` declares its reach under `kizuna.entries` in its own `package.json`. `tests/client-safe.test.ts` enforces the boundary rather than documenting it: it bundles every `client` entry for a browser target and fails on any Node built-in, and it generates a fetch client from the demo config and checks that the file imports nothing and bundles on its own. It reads `dist`, so run `pnpm build` before it.

Plugin routes never join `api.routes`. The generators walk them under the plugin's slug through `walkApi`.

# Publishing

Every package under `packages/` publishes to npmjs. Core publishes unscoped as `kizunajs`, the rest as `@kizunajs/*`. The release workflow authenticates with GitHub's OIDC token, not a stored secret: each package has a trusted publisher on npm naming this repository and `release.yaml`. There is no `NPM_TOKEN`, and nothing needs one.

`private: true` is what keeps a workspace package unpublished, which is why nothing in `apps/` or `docs` reaches the registry.

## Adding a package

A package needs everything the published thirteen carry, or its npm page is the poorer for it. Copy an existing sibling's `package.json` and keep every field: `description`, `keywords` (the shared base plus a few specific), `license`, `homepage` pointing at that package's own docs page, `repository` with its `directory`, `bugs`, `sideEffects`, `engines`, and `publishConfig.access` set to `public`. A scoped package publishes **restricted** without that last one.

Also add a `README.md`, because npm renders the package's own file and nothing else. Four parts: the description, an install line, the smallest snippet that works, and a link to its docs page. Take the snippet from the docs rather than writing a fresh one. Add the package to the table in the root `README.md` too, which is where its `description` comes from.

## The first publish of a new package

npm cannot configure a trusted publisher for a package that does not exist yet, and the release workflow holds no token to fall back on. So a new package cannot publish itself, and the bootstrap is manual:

1. Ship it with `private: true` so `pnpm -r publish` skips it and a release cannot half-fail on it.
2. Let a release go out first. `pnpm publish` rewrites `workspace:*` to the exact version it finds, so the package pins its peers to sibling versions that have to be on npm already. A new package often needs exports added to a sibling in the same PR, and those reach the registry with that release.
3. Publish it once by hand, from a clean checkout of the release tag, with the `private: true` line deleted in the working tree. pnpm and npm both refuse to publish a package marked private, and pnpm says so as `There are no new packages that should be published`. A tag checkout leaves HEAD detached, which pnpm's branch check rejects, so pass `--no-git-checks`:

    ```
    pnpm --filter @kizunajs/<name> build
    pnpm --filter @kizunajs/<name> publish --access public --no-git-checks
    ```

    Answer the 2FA prompt. This has to be interactive, as the registry asks for a one-time password.

4. Add the trusted publisher at `https://www.npmjs.com/package/@kizunajs/<name>/access`: GitHub Actions, `kizunajs`, `kizuna`, workflow `release.yaml`, no environment, both `publish` and `stage publish` allowed.
5. Commit the removal of `private: true`, once the trusted publisher is in place. A release that runs with the flag off and no trusted publisher fails on the package.

Every release after that publishes it with the rest, and the one hand-published version is the only one without a provenance attestation.

When changing any exported function, type, or option in `packages/*/src/`, check if README.md, JSDoc examples, guide pages in `docs/content/docs/`, or API reference pages in `docs/content/docs/reference/` reference the old API. If so, update them in the same change. When in doubt, grep the `docs/` directory for the function or type name.

# Running tests

- `pnpm test` runs Vitest + Swift end-to-end. Always use this.
- `pnpm test:types` runs type-level tests only (`*.test-d.ts`).
- `pnpm -r typecheck` runs `tsc --noEmit` across all packages. Always pair with `pnpm test` before declaring something done.
- `pnpm typecheck:tests` typechecks every package's `src`, test files included. Each package's own tsconfig excludes them, so this is the only check that sees a type error in a test.
- `pnpm build` rebuilds all packages. Required before typechecking after changing cross-package exports.
- `pnpm --filter @kizunajs-demo/kotlin test` runs Kotlin end-to-end (starts express-demo, compiles the generated client, runs `./gradlew test`). Not part of `pnpm test`.
- `pnpm --filter @kizunajs-demo/next e2e` runs the CMS preview in Playwright. It starts its own `next dev` on port 3031 with a fresh PGlite database on 5498 and its own `.next-e2e` folder, so it runs beside `pnpm dev` without touching its content. Not part of `pnpm test`.

## Compiling the Kotlin demo

The Kotlin demo (`apps/kotlin-demo/kotlin`) verifies that generated `@kizunajs/kotlin` output actually compiles. Its Gradle (8.10.2, `jvmToolchain(17)`) **rejects JDK 26** with a cryptic `What went wrong: 26.0.1` error, so run it with JDK 17:

```
JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" ./gradlew compileKotlin
```

`openjdk@17` is available via Homebrew (`brew install openjdk@17`). The same `JAVA_HOME` is needed for the `test` script above.

# Formatting

After finishing code edits, always run `pnpm format:check` to verify formatting. If it fails, run `pnpm format` to fix it.
