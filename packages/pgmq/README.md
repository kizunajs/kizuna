# @kizunajs/pgmq

`@kizunajs/pgmq` keeps the jobs you queue in pgmq queues inside your Postgres database, and a worker runs them.

## Installation

```sh
pnpm add @kizunajs/pgmq pg
```

## Usage

```ts
// kizuna.config.ts
import pg from 'pg';
import { pgmq } from '@kizunajs/pgmq';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

export default defineConfig({
    adapter: expressAdapter(),
    routes,
    jobs,
    jobRunner: {
        mode: 'in-process',
        transport: pgmq({
            pool,
        }),
    },
});
```

```ts
// src/index.ts
import { startJobs, startJobWorker } from 'kizunajs/jobs';

kizuna.api.mount(app);
startJobs(kizuna.api);

const worker = await startJobWorker(kizuna.api);
process.on('SIGTERM', () => void worker?.stop());
```

## Documentation

[pgmq](https://kizunajs.com/docs/pgmq)
