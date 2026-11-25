import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { defineConfig } from 'kizunajs';
import { fastifyAdapter } from './server.js';
import { backgroundRoutes } from '../../core/src/adapter-testing/fixtures.js';

describe('waitUntil on Fastify', () => {
    it('hands the work to the waitUntil it was mounted with', async () => {
        const app = Fastify();
        const waitUntil = vi.fn();
        await defineConfig({
            adapter: fastifyAdapter(),
            routes: [backgroundRoutes],
        }).api.mount(app, {
            waitUntil,
        });

        const response = await app.inject({
            method: 'POST',
            url: '/tasks/reminders',
        });

        expect(response.statusCode).toBe(202);
        expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });
});
