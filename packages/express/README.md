# @ts-kizuna/express

`@ts-kizuna/express` connects a Kizuna API to an Express 5 application. It handles routing, request validation, body parsing, and error formatting, all driven by what you declared.

**Requires Express >= 5.**

## Installation

```sh
pnpm add @ts-kizuna/express express
```

## Usage

```ts
// kizuna.config.ts
import { defineConfig } from '@ts-kizuna/core';
import { expressAdapter } from '@ts-kizuna/express';
import { routes } from './src/routes';

export default defineConfig({
    adapter: expressAdapter(),
    routes,
});
```

```ts
// src/index.ts
import express from 'express';
import kizuna from '../kizuna.config';

const app = express();
app.use(express.json());

kizuna.api.mount(app);

app.listen(3000);
```

## Documentation

[Express adapter](https://ts-kizuna.com/docs/adapters/express)
