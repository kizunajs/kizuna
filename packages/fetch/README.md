# @kizunajs/fetch

`@kizunajs/fetch` is the typed client for your routes, a wrapper around the native `fetch` API. It runs anywhere `fetch` does, React Native included.

## Installation

```sh
pnpm add @kizunajs/fetch
```

## Usage

Add `fetchClient` to your config and run `kizuna generate`:

```ts
import { fetchClient } from '@kizunajs/fetch/server';

export default defineConfig({
    adapter: expressAdapter(),
    routes: {
        users,
    },
    clients: [
        fetchClient({
            output: './src/lib/api-client.generated.ts',
        }),
    ],
});
```

The generated file exports `createClient`:

```ts
import { createClient } from './api-client.generated';

const apiClient = createClient({
    baseUrl: 'http://localhost:3000',
});

const result = await apiClient.users.getUser({
    params: {
        id: '1',
    },
});
```

## Documentation

[Fetch client](https://kizunajs.com/docs/clients/fetch)
