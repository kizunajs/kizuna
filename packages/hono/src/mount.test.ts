import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { honoAdapter } from './server.js';
import { userInput, resetUsers } from '../../core/src/adapter-testing/fixtures.js';
import { defineConfig } from 'kizunajs';

describe('api.mount', () => {
    it('serves routes', async () => {
        resetUsers();
        const api = defineConfig({ ...userInput, adapter: honoAdapter() }).api;
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
