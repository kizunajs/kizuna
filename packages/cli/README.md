# @ts-kizuna/cli

The `kizuna` command, which writes the `Config` your `kizuna.config.ts` implies and every client it declares. The package also exports the config loader the Swift and Kotlin generators share.

## Installation

```sh
pnpm add -D @ts-kizuna/cli
```

## Usage

```sh
kizuna generate
```

Writes `kizuna.types.ts` beside your config, and every target under `clients`. A file that already matches is left alone.

```sh
kizuna generate --check
```

The same work without writing. Names whatever has fallen behind and exits `1`, for a pipeline to fail on.

## Documentation

[Configuration](https://ts-kizuna.com/docs/configuration)
