# @kizunajs/swift

`@kizunajs/swift` generates a native Swift client from your Kizuna routes. The generated client uses `URLSession` and `Codable`, with no third-party Swift dependencies.

## Installation

```sh
pnpm add -D @kizunajs/swift
```

## Usage

Name the client in your config, and `kizuna generate` writes it with the rest:

```ts
import { swiftClient } from '@kizunajs/swift';

export default defineConfig({
    routes,
    clients: [
        swiftClient({
            output: '../ios/MyApp/Generated/APIClient.swift',
            namespace: 'API',
        }),
    ],
});
```

```sh
kizuna generate
```

## Documentation

[Swift client generation](https://kizunajs.com/docs/clients/swift)
