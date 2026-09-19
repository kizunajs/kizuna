import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { expressAdapter } from './server.js';
import { userInput, resetUsers } from '../../core/src/adapter-testing/fixtures.js';
import { defineConfig } from '@ts-kizuna/core';

describe('api.mount', () => {
    it('serves routes', async () => {
        resetUsers();
        const api = defineConfig({ ...userInput, adapter: expressAdapter }).api;
        const app = express();
        app.use(express.json());
        api.mount(app);
        await request(app).post('/users').send({ name: 'Ada', email: 'ada@example.com' });
        expect((await request(app).get('/users/1')).status).toBe(200);
    });
});
