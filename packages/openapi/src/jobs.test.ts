import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna, type Contract } from '@ts-kizuna/core';
import { defineConfig } from '@ts-kizuna/core';
import { renderOpenApi } from './generator.js';

interface Config {
    auth: {
        identities: {
            scheduler: typeof scheduler;
        };
    };
}

const k = new Kizuna<Config>();

const scheduler = k.identity.bearer({});

const config = {
    auth: {
        identities: {
            scheduler,
        },
    },
};

const routes = k.routes({
    listUsers: k.route({
        method: 'GET',
        path: '/users',
        auth: false,
        summary: 'List users',
        responses: {
            200: z.array(z.string()),
        },
    }),
});

const jobs = k.jobs('scheduler', {
    sendDigests: k.job({
        schedule: '0 5 * * *',
        summary: 'Send daily digest emails',
        result: z.object({
            sent: z.int(),
        }),
    }),
    reconcile: k.job({
        schedule: {
            cron: '*/15 * * * *',
            timezone: 'Europe/Oslo',
        },
    }),
});

const contract = defineConfig({
    ...config,
    routes,
    jobs,
}).api as unknown as Contract;

const generate = () =>
    renderOpenApi(contract, {
        info: {
            title: 'Test API',
            version: '1.0.0',
        },
    })('json') as unknown as {
        paths: Record<string, Record<string, Record<string, unknown>>>;
    };

describe('jobs in the OpenAPI document', () => {
    it('leaves every job out: a job has no operation to document', () => {
        expect(Object.keys(generate().paths)).toEqual(['/users']);
    });

    it('leaves the job endpoints out too', () => {
        expect(Object.keys(generate().paths)).not.toContain('/jobs');
    });
});
