# @kizunajs/tanstack-query

`@kizunajs/tanstack-query` provides `new KizunaTanstackQuery()`, which builds TanStack Query options from a generated Kizuna fetch client. Query keys, caching, and invalidation come from the routes you already wrote.

## Installation

```sh
pnpm add @kizunajs/tanstack-query
```

## Usage

```ts
import { useQuery } from '@tanstack/react-query';
import { KizunaTanstackQuery } from '@kizunajs/tanstack-query';
import { createClient } from './api-client.generated';

const api = new KizunaTanstackQuery(
    createClient({
        baseUrl: 'http://localhost:3000',
    })
);

const { data } = useQuery(
    api.users.getUser.queryOptions({
        input: {
            params: {
                id: '1',
            },
        },
    })
);
```

## Documentation

[TanStack Query client](https://kizunajs.com/docs/clients/tanstack-query)
