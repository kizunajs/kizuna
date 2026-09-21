# @kizunajs/kotlin

`@kizunajs/kotlin` generates a native Kotlin client from your Kizuna routes. The generated client uses OkHttp for HTTP, kotlinx.serialization for JSON, and Kotlin coroutines for async.

## Installation

```sh
pnpm add -D @kizunajs/kotlin
```

## Usage

Name the client in your config, and `kizuna generate` writes it with the rest:

```ts
import { kotlinClient } from '@kizunajs/kotlin';

export default defineConfig({
    routes,
    clients: [
        kotlinClient({
            output: '../android/app/src/main/kotlin/com/example/APIClient.kt',
            namespace: 'API',
            package: 'com.example',
        }),
    ],
});
```

```sh
kizuna generate
```

## Documentation

[Kotlin client generation](https://kizunajs.com/docs/clients/kotlin)
