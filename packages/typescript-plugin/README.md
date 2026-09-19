# @ts-kizuna/typescript-plugin

TypeScript language service plugin that surfaces [ts-kizuna](https://ts-kizuna.com) deprecations in editors. Deprecated routes and fields are struck through everywhere your API's types flow, hovering shows the migration message, and completions strike through deprecated entries.

## Install

```sh
pnpm add -D @ts-kizuna/typescript-plugin
```

## Usage

Declare the plugin in `tsconfig.json`:

```json
{
    "compilerOptions": {
        "plugins": [
            {
                "name": "@ts-kizuna/typescript-plugin"
            }
        ]
    }
}
```

Deprecations are declared once, on the route:

```ts
deleteUser: k
    .route({
        method: 'DELETE',
        path: '/users/:id',
        deprecated: 'use archiveUser instead',
        // ...
    })
    .handler(/* ... */),
```

[Documentation](https://ts-kizuna.com/docs/vscode)
