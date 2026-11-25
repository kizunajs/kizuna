import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { defineConfig } from 'kizunajs';
import { expressAdapter } from './server.js';
import { backgroundRoutes } from '../../core/src/adapter-testing/fixtures.js';

describe('waitUntil on Express', () => {
    it('hands the work to the waitUntil it was mounted with', async () => {
        const app = express();
        const waitUntil = vi.fn();
        defineConfig({
            adapter: expressAdapter(),
            routes: [backgroundRoutes],
        }).api.mount(app, {
            waitUntil,
        });

        const response = await request(app).post('/tasks/reminders');

        expect(response.status).toBe(202);
        expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
    });
});
