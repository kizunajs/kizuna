# @kizunajs/jwt

`@kizunajs/jwt` verifies JWTs from any sign-in provider in a Kizuna.js guard. It checks the signature against the provider's public keys, and the issuer, audience and expiry every time.

## Installation

```sh
pnpm add @kizunajs/jwt
```

## Usage

```ts
// src/identities.ts
import { verifyJwt } from '@kizunajs/jwt';

export const user = k.identity
    .bearer({
        bearerFormat: 'JWT',
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(
        verifyJwt({
            jwks: 'https://auth.example.com/.well-known/jwks.json',
            issuer: 'https://auth.example.com',
            audience: 'https://api.example.com',
            algorithms: ['RS256'],
            claims: z.object({
                sub: z.string(),
            }),
            context: ({ claims }) => ({
                userId: claims.sub,
            }),
        })
    );
```

## Documentation

[JWT](https://kizunajs.com/docs/jwt)
