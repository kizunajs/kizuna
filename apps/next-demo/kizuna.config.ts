import { defineConfig } from '@ts-kizuna/core';
import { nextAdapter } from '@ts-kizuna/next';
import { mcpPlugin } from '@ts-kizuna/mcp';
import { openApiPlugin } from '@ts-kizuna/openapi';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@ts-kizuna-demo/shared';
import { diagnostics } from './src/routes/diagnostics';

/**
 * The shared routes every demo serves, plus the ones only this demo can answer.
 */
const served = {
    ...routes,
    diagnostics,
};

export const { api } = defineConfig({
    adapter: nextAdapter(),
    tags,
    identities: {
        user,
        member,
        inviteToken,
        scheduler,
    },
    requestContext: {
        analytics,
    },
    guardSchema: GuardSchema,
    issueCodes: ['invalid_phone_number'],
    routes: served,
    jobs,
    plugins: [
        mcpPlugin({
            name: 'ts-kizuna demo',
        }),
        openApiPlugin({
            info: {
                title: 'ts-kizuna demo',
                version: '1.0.0',
                description: 'The ts-kizuna user API, shared by every adapter demo.',
            },
            setOperationId: true,
            docsPath: '/docs',
            jsonPath: '/openapi.json',
        }),
    ],
});
