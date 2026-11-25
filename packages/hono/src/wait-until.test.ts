import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { defineConfig } from 'kizunajs';
import { honoAdapter } from './server.js';
import { backgroundRoutes } from '../../core/src/adapter-testing/fixtures.js';

const api = defineConfig({
    adapter: honoAdapter(),
    routes: [backgroundRoutes],
}).api;

const remind = (app: Hono, env?: unknown, executionContext?: unknown) =>
    app.request(
        '/tasks/reminders',
        {
            method: 'POST',
        },
        env as never,
        executionContext as never
    );

describe('waitUntil on Hono', () => {
    it('hands the work to the Workers execution context', async () => {
        const app = new Hono();
        api.mount(app);
        const waitUntil = vi.fn();

        await remind(app, undefined, {
            waitUntil,
            passThroughOnException: () => undefined,
            props: {},
        });

        expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it('hands the work to the Netlify context', async () => {
        const app = new Hono();
        api.mount(app);
        const waitUntil = vi.fn();

        await remind(app, {
            context: {
                waitUntil,
            },
        });

        expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });

    it('hands the work to the waitUntil it was mounted with', async () => {
        const app = new Hono();
        const waitUntil = vi.fn();
        api.mount(app, {
            waitUntil,
        });

        await remind(app);

        expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });
});
