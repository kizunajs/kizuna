import { createAuthClient } from 'better-auth/client';
import { defineBetterAuthPlugin } from '@kizunajs/better-auth';

/**
 * The demo's client for its Better Auth app.
 */
export const authClient = createAuthClient({
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3001',
});

export const betterAuthPlugin = defineBetterAuthPlugin({
    client: authClient,
});
