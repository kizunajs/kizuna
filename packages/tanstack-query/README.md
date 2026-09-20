# @kizunajs/tanstack-query

`@kizunajs/tanstack-query` provides `new KizunaTanstackQuery()`, which builds TanStack Query options from a Kizuna api. Query keys, caching, and invalidation come from the routes you already wrote.

## Installation

```sh
pnpm add @kizunajs/tanstack-query
```

## Usage

```ts
import { useQuery } from '@tanstack/react-query';
import { KizunaTanstackQuery } from '@kizunajs/tanstack-query';
import { apiClient } from './api-client';

const api = new KizunaTanstackQuery(apiClient);

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
