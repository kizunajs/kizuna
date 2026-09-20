# @kizunajs/swift

`@kizunajs/swift` generates a native Swift client from your Kizuna routes. The generated client uses `URLSession` and `Codable`, with no third-party Swift dependencies.

## Installation

```sh
pnpm add -D @kizunajs/swift
```

## Usage

```sh
kizuna-swift generate --config kizuna.config.ts --output ios/MyApp/Generated/APIClient.swift --namespace-name API
```

## Documentation

[Swift client generation](https://kizunajs.com/docs/clients/swift)
