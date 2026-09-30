# @kizunajs/better-auth

`@kizunajs/better-auth` lets your Kizuna API own every user flow while a Better Auth app does the work. Your routes call any Better Auth endpoint, typed, and the emails Better Auth needs sent come back to your API.

## Installation

In your API:

```sh
pnpm add @kizunajs/better-auth better-auth
```

In your Better Auth app:

```sh
pnpm add @kizunajs/better-auth
```

## Usage

In your API, build the plugin around your Better Auth client, and name your Better Auth app's type so every event it sends is typed:

```ts
// src/better-auth.ts
import { createAuthClient } from 'better-auth/client';
import { betterAuthApp, defineBetterAuthPlugin } from '@kizunajs/better-auth';
import type { auth } from '../../auth/src/auth';

export const authClient = createAuthClient({
    baseURL: 'https://auth.example.com',
});

export const betterAuthPlugin = defineBetterAuthPlugin({
    client: authClient,
    app: betterAuthApp<typeof auth>(),
});
```

Every handler then calls Better Auth at `plugins.betterAuth`:

```ts
await plugins.betterAuth.changeEmail({
    newEmail: body.email,
    fetchOptions: {
        headers: {
            authorization: `Bearer ${auth.member.token}`,
        },
    },
});
```

In your Better Auth app, add the `kizuna` plugin, and place `forward()` in the callbacks other plugins take:

```ts
import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { kizuna } from '@kizunajs/better-auth/client';

const kizunaApi = kizuna({
    url: 'https://api.example.com/better-auth/webhooks',
    headers: {
        authorization: `Bearer ${process.env.KIZUNA_SERVICE_TOKEN}`,
    },
});

export const auth = betterAuth({
    emailAndPassword: {
        enabled: true,
    },
    plugins: [
        magicLink({
            sendMagicLink: kizunaApi.forward(),
        }),
        kizunaApi,
    ],
});
```

## Documentation

[Better Auth](https://kizunajs.com/docs/better-auth)
