import { defineConfig } from '@ts-kizuna/core';
import { fetchClient } from '@ts-kizuna/fetch/server';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@ts-kizuna-demo/shared';

export default defineConfig({
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
