import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch/server';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@kizunajs-demo/shared';

export default defineConfig({
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
    routes,
    jobs,
    clients: [
        fetchClient({
            output: './src/api-client.generated.ts',
        }),
    ],
});
