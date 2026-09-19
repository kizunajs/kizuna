import { KizunaClient } from '@ts-kizuna/fetch';
import { KizunaTanstackQuery } from '@ts-kizuna/tanstack-query';
import { defineConfig } from '@ts-kizuna/core';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@ts-kizuna-demo/shared';

const kizuna = defineConfig({
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
});

export const apiClient = new KizunaClient(kizuna.api, {
    baseUrl: '/api',
    requestContext: {
        'x-posthog-session-id': 'tanstack-query-demo',
    },
});

export const api = new KizunaTanstackQuery(apiClient);
