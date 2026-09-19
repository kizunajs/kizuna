# @ts-kizuna/tanstack-query

`@ts-kizuna/tanstack-query` provides `new KizunaTanstackQuery()`, which builds TanStack Query options from a ts-kizuna api. Query keys, caching, and invalidation come from the routes you already wrote.

## Installation

```sh
pnpm add @ts-kizuna/tanstack-query
```

## Usage

```ts
import { useQuery } from '@tanstack/react-query';
import { KizunaClient } from '@ts-kizuna/fetch';
import { KizunaTanstackQuery } from '@ts-kizuna/tanstack-query';
import kizuna from '../kizuna.config';

const apiClient = new KizunaClient(kizuna.api, {
    baseUrl: 'http://localhost:3000',
});

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

[TanStack Query client](https://ts-kizuna.com/docs/clients/tanstack-query)
