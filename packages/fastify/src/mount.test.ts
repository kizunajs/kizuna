import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { Kizuna } from '@ts-kizuna/core';
import { fastifyAdapter, fastifyKizuna } from './server.js';
import { userInput, resetUsers } from '../../core/src/adapter-testing/fixtures.js';
import { defineConfig } from '@ts-kizuna/core';

interface Config {
    adapter: typeof fastifyAdapter;
}

const k = new Kizuna<Config>();

const config = {
    adapter: fastifyAdapter,
};

describe('api.mount and the fastify plugin', () => {
    it('mount(app) serves routes', async () => {
        resetUsers();
        const api = defineConfig({ ...userInput, adapter: fastifyAdapter }).api;
        const app = Fastify();
        await api.mount(app);
        await app.inject({ method: 'POST', url: '/users', payload: { name: 'Ada', email: 'ada@example.com' } });
        expect((await app.inject({ method: 'GET', url: '/users/1' })).statusCode).toBe(200);
    });

    it('app.register(fastifyKizuna) serves routes', async () => {
        resetUsers();
        const api = defineConfig({ ...userInput, adapter: fastifyAdapter }).api;
        const app = Fastify();
        await app.register(fastifyKizuna, { api: api as never });
        await app.inject({ method: 'POST', url: '/users', payload: { name: 'Ada', email: 'ada@example.com' } });
        expect((await app.inject({ method: 'GET', url: '/users/1' })).statusCode).toBe(200);
    });
});
