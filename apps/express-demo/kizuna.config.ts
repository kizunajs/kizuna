import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch/server';
import { kotlinClient } from '@kizunajs/kotlin';
import { swiftClient } from '@kizunajs/swift';
import { expressAdapter } from '@kizunajs/express';
import { mcpPlugin } from '@kizunajs/mcp';
import { openApiPlugin } from '@kizunajs/openapi';
import { resendPlugin } from '@kizunajs/resend';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@kizunajs-demo/shared';
import { diagnostics } from './src/routes/diagnostics';
import { contact } from './src/routes/contact';
import { newsletter } from './src/routes/newsletter';
import { emailPlugin } from './src/plugins/email';
import { resendEvents } from './src/resend-events';

/**
 * The shared routes every demo serves, plus the ones only this demo can answer.
 */
const served = {
    ...routes,
    diagnostics,
    contact,
    newsletter,
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
        swiftClient({
            output: '../swift-demo/swift/Sources/APIClient/APIClient.swift',
            namespace: 'API',
        }),
        swiftClient({
            output: '../swift-demo/swift/Sources/OpenEnumAPIClient/OpenEnumAPIClient.swift',
            namespace: 'OpenEnumAPI',
            unknownEnumCase: true,
        }),
        kotlinClient({
            output: '../kotlin-demo/kotlin/src/main/kotlin/com/kizuna/demo/APIClient.kt',
            namespace: 'API',
            package: 'com.kizuna.demo',
        }),
        kotlinClient({
            output: '../kotlin-demo/kotlin/src/main/kotlin/com/kizuna/demo/openenum/APIClient.kt',
            namespace: 'OpenEnumAPI',
            package: 'com.kizuna.demo.openenum',
            unknownEnumCase: true,
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
        emailPlugin({
            from: 'Kizuna demo <hello@example.com>',
        }),
        resendPlugin({
            apiKey: process.env.RESEND_API_KEY ?? 're_demo',
            from: 'Kizuna demo <hello@example.com>',
            lists: {
                weekly: {
                    segmentId: process.env.RESEND_SEGMENT_ID ?? 'seg_demo',
                },
            },
            webhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? 'whsec_ZGVtbw==',
            on: resendEvents,
        }),
    ],
});
