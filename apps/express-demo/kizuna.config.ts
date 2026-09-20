import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch/server';
import { expressAdapter } from '@kizunajs/express';
import { mcpPlugin } from '@kizunajs/mcp';
import { openApiPlugin } from '@kizunajs/openapi';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@kizunajs-demo/shared';
import { diagnostics } from './src/routes/diagnostics';

/**
 * The shared routes every demo serves, plus the ones only this demo can answer.
 */
const served = {
    ...routes,
    diagnostics,
};

export default defineConfig({
    adapter: expressAdapter(),
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
            name: 'Kizuna demo',
        }),
        openApiPlugin({
            info: {
                title: 'Kizuna demo',
                version: '1.0.0',
            },
            setOperationId: true,
            docsPath: '/docs',
            jsonPath: '/openapi.json',
        }),
    ],
});
