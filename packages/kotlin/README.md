# @kizunajs/kotlin

`@kizunajs/kotlin` generates a native Kotlin client from your Kizuna routes. The generated client uses OkHttp for HTTP, kotlinx.serialization for JSON, and Kotlin coroutines for async.

## Installation

```sh
pnpm add -D @kizunajs/kotlin
```

## Usage

```sh
kizuna-kotlin generate --config kizuna.config.ts --out android/app/src/main/kotlin/com/example/APIClient.kt --namespace-name API --package com.example
```

## Documentation

[Kotlin client generation](https://kizunajs.com/docs/clients/kotlin)
