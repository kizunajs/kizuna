import { describe, expect, it, vi } from 'vitest';

const after = vi.hoisted(() => vi.fn());

vi.mock('next/server', async (importOriginal) => ({
    ...(await importOriginal<typeof import('next/server')>()),
    after,
}));

const { NextRequest } = await import('next/server');
const { defineConfig } = await import('kizunajs');
const { nextAdapter } = await import('./server.js');
const { backgroundRoutes } = await import('../../core/src/adapter-testing/fixtures.js');

describe('waitUntil on Next', () => {
    it("hands the work to Next's after()", async () => {
        const handlers = defineConfig({
            adapter: nextAdapter(),
            routes: [backgroundRoutes],
        }).api.mount();

        const response = await handlers.POST(
            new NextRequest('http://localhost:3000/tasks/reminders', {
                method: 'POST',
            })
        );

        expect(response.status).toBe(202);
        expect(after).toHaveBeenCalledWith(expect.any(Promise));
    });
});
