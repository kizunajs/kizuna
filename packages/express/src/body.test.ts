import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { expressAdapter, keepRawBody } from './server.js';
import { responseShapeInput, signedBodyText } from '../../core/src/adapter-testing/fixtures.js';
import { defineConfig } from 'kizunajs';

const createApi = () =>
    defineConfig({
        ...responseShapeInput,
        adapter: expressAdapter(),
    }).api;

const postSigned = (app: express.Express) => request(app).post('/signed').set('content-type', 'application/json').send(signedBodyText);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('request bodies', () => {
    it('parses the body of its own routes', async () => {
        const app = express();
        createApi().mount(app);

        const response = await request(app).post('/validated').send({
            name: 'Ada',
        });

        expect(response.status).toBe(201);
    });

    it('uses the body an app parsed with its own express.json()', async () => {
        const app = express();
        app.use(express.json());
        createApi().mount(app);

        const response = await request(app).post('/validated').send({
            name: 'Ada',
        });

        expect(response.status).toBe(201);
    });

    it('takes the express.json() options', async () => {
        const app = express();
        createApi().mount(app, {
            json: {
                strict: false,
            },
        });

        // Without `strict: false` a JSON string is refused before validation, with no `errors`.
        const response = await request(app).post('/validated').set('content-type', 'application/json').send('"Ada"');

        expect(response.status).toBe(400);
        expect(response.body.errors).toHaveLength(1);
    });
});

describe('rawBody', () => {
    it('keeps the body as sent when kizuna parses it', async () => {
        const app = express();
        createApi().mount(app);

        const response = await postSigned(app);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            rawBody: signedBodyText,
            name: 'Ada',
        });
    });

    it('keeps the body as sent when the app parses it with keepRawBody', async () => {
        const app = express();
        app.use(
            express.json({
                verify: keepRawBody,
            })
        );
        createApi().mount(app);

        const response = await postSigned(app);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            rawBody: signedBodyText,
            name: 'Ada',
        });
    });

    it('answers 500 and logs both fixes when the app parsed the body without keeping it', async () => {
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const app = express();
        app.use(express.json());
        createApi().mount(app);

        const response = await postSigned(app);

        expect(response.status).toBe(500);
        expect(logged).toHaveBeenCalledWith(expect.stringContaining('mount kizuna before express.json(), or pass `verify: keepRawBody`'));
    });
});
