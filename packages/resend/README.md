# @kizunajs/resend

`@kizunajs/resend` connects your API to Resend. Your route and job handlers send email and newsletters, and Resend's webhook events run functions you write.

## Installation

```sh
pnpm add @kizunajs/resend resend
```

## Usage

```ts
// kizuna.config.ts
import { resendPlugin } from '@kizunajs/resend';

export default defineConfig({
    adapter: expressAdapter(),
    routes,
    plugins: [
        resendPlugin({
            apiKey: process.env.RESEND_API_KEY,
            from: 'Kizuna <hello@example.com>',
        }),
    ],
});
```

Every route and job handler reaches it at `plugins.resend`:

```ts
await plugins.resend.sendEmail({
    to: user.email,
    subject: 'Welcome',
    html: `<p>Welcome, ${user.name}.</p>`,
});
```

## Documentation

[Resend](https://kizunajs.com/docs/resend)
