import { KizunaClient } from '@ts-kizuna/fetch';
import { KizunaTanstackQuery } from '@ts-kizuna/tanstack-query';
import { defineConfig } from '@ts-kizuna/core';
import { GuardSchema, analytics, jobs, routes, tags, tools, user, member, inviteToken, scheduler } from '@ts-kizuna-demo/shared';

const { api: contract } = defineConfig({
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
    routes,
    jobs,
    tools,
});

export const apiClient = new KizunaClient(contract, {
    baseUrl: '/api',
    requestContext: {
        'x-posthog-session-id': 'tanstack-query-demo',
    },
});

export const api = new KizunaTanstackQuery(contract, apiClient);
