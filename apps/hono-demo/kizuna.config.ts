import { defineConfig } from '@ts-kizuna/core';
import { honoAdapter } from '@ts-kizuna/hono';
import { mcpPlugin } from '@ts-kizuna/mcp';
import { openApiPlugin } from '@ts-kizuna/openapi';
import { GuardSchema, analytics, jobs, routes, tags, tools, user, member, inviteToken, scheduler } from '@ts-kizuna-demo/shared';
import { diagnostics } from './src/routes/diagnostics';

/**
 * The shared routes every demo serves, plus the ones only this demo can answer.
 */
const served = {
    ...routes,
    diagnostics,
};

export const { api } = defineConfig({
    adapter: honoAdapter,
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
    tools,
    plugins: [
        mcpPlugin({
            name: 'ts-kizuna demo',
            routes: served,
            tools,
            options: {
                publishRoutes: {
                    users: {
                        '*': true,
                        exportUsers: false,
                    },
                    workspace: true,
                    members: true,
                },
                hideTools: ['countWords'],
            },
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
