# @ts-kizuna/cli

`loadContract` imports a `kizuna.config.ts` from TypeScript source, no build step needed. The Swift and Kotlin generators use it to load the api they generate from. `writeClients` and `checkClients` write every client a config declares, and report the ones that have fallen behind.

## Installation

```sh
pnpm add -D @ts-kizuna/cli
```

## Usage

```ts
import { loadContract, checkClients } from '@ts-kizuna/cli';

const api = await loadContract('./kizuna.config.ts');
const stale = checkClients(api, clients);
```

## Documentation

[ts-kizuna docs](https://ts-kizuna.com/docs)
