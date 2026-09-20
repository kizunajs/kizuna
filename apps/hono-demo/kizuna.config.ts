import { defineConfig } from '@ts-kizuna/core';
import { fetchClient } from '@ts-kizuna/fetch/server';
import { honoAdapter } from '@ts-kizuna/hono';
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

export default defineConfig({
    adapter: honoAdapter(),
    typescript: {
        outputFile: './kizuna.types.ts',
    },
    tags,
    auth: {
        identities: {
            user,
            member,
            inviteToken,
            scheduler,
        },
        guardSchema: GuardSchema,
    },
    requestContext: {
        analytics,
    },
    validation: {
        issueCodes: ['invalid_phone_number'],
    },
    routes: served,
    jobs,
    clients: [
        fetchClient({
            output: './src/lib/api-client.generated.ts',
        }),
    ],
    plugins: [
        mcpPlugin({
            name: 'ts-kizuna demo',
        }),
        openApiPlugin({
            info: {
                title: 'ts-kizuna demo',
                version: '1.0.0',
            },
            setOperationId: true,
            docsPath: '/docs',
            jsonPath: '/openapi.json',
        }),
    ],
});
