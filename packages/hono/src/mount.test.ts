import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { Kizuna } from '@ts-kizuna/core';
import { honoAdapter } from './server.js';
import { userContract, resetUsers } from '../../core/src/adapter-testing/fixtures.js';

const k = new Kizuna({
    adapter: honoAdapter,
});

describe('api.mount', () => {
    it('serves routes', async () => {
        resetUsers();
        const api = k.api({
            contract: userContract,
        });
        const app = new Hono();
        api.mount(app);
        await app.request('/users', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Ada', email: 'ada@example.com' }),
        });
        expect((await app.request('/users/1')).status).toBe(200);
    });
});
