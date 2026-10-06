import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch';
import { GuardSchema, analytics, groups, jobs, routes, user, member, inviteToken, scheduler } from '@kizunajs-demo/shared';

export default defineConfig({
    typescript: {
        outputFile: './kizuna.types.ts',
    },
    groups,
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
    jobRunner: {
        mode: 'http',
    },
    jobs,
    clients: [
        fetchClient({
            output: './src/api-client.generated.ts',
        }),
    ],
});
