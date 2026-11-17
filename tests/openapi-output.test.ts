import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { createClient } from '@hey-api/openapi-ts';
import { generateOpenApi } from '../packages/openapi/src/generator.js';
import kizuna from '../apps/express-demo/kizuna.config.js';

/**
 * The OpenAPI document is for people who generate their own client, so this
 * builds the Express demo's document, hands it to a generator Kizuna does not
 * ship, and checks that what comes out compiles and reaches the running API.
 */
const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, `tests/.generated-openapi-${process.pid}`);
const express = createRequire(path.join(ROOT, 'apps/express-demo/package.json'))('express') as () => {
    listen: (port: number) => Server;
};

interface GeneratedSdk {
    listUsers: (options: unknown) => Promise<{ response: Response; data?: unknown }>;
    createUser: (options: unknown) => Promise<{ response: Response; data?: { id: string } }>;
    getUser: (options: unknown) => Promise<{ response: Response; data?: unknown }>;
}

const typeScriptFilesIn = (directory: string): string[] =>
    fs
        .readdirSync(directory, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.ts'))
        .map((file) => path.join(directory, file));

describe('a client generated from the OpenAPI document by another tool', () => {
    let server: Server;
    let baseUrl: string;
    let sdk: GeneratedSdk;

    beforeAll(async () => {
        await createClient({
            input: generateOpenApi(kizuna.api as never)('json') as unknown as Record<string, unknown>,
            output: OUTPUT,
            plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk'],
            logs: {
                level: 'silent',
            },
        });

        const app = express();
        kizuna.api.mount(app as never);
        server = app.listen(0);
        baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

        const { client } = (await import(path.join(OUTPUT, 'client.gen.ts'))) as {
            client: {
                setConfig: (config: { baseUrl: string }) => void;
            };
        };
        client.setConfig({
            baseUrl,
        });
        sdk = (await import(path.join(OUTPUT, 'sdk.gen.ts'))) as GeneratedSdk;
    }, 60_000);

    afterAll(() => {
        server?.close();
        fs.rmSync(OUTPUT, {
            recursive: true,
            force: true,
        });
    });

    it('compiles under strict TypeScript', () => {
        const program = ts.createProgram(typeScriptFilesIn(OUTPUT), {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            lib: ['lib.es2024.d.ts', 'lib.dom.d.ts'],
        });
        const errors = ts.getPreEmitDiagnostics(program).map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        expect(errors).toEqual([]);
    });

    it('sends query parameters the server reads', async () => {
        const result = await sdk.listUsers({
            query: {
                page: 1,
                limit: 2,
            },
        });
        expect(result.response.status).toBe(200);
        expect(result.data).toMatchObject({
            users: expect.any(Array),
            total: expect.any(Number),
        });
    });

    it('sends a JSON body, a path parameter and a header the server reads', async () => {
        const created = await sdk.createUser({
            body: {
                name: 'Ada Lovelace',
                email: 'ada@example.com',
            },
        });
        expect(created.response.status).toBe(201);

        const fetched = await sdk.getUser({
            path: {
                id: created.data!.id,
            },
            headers: {
                'x-request-id': 'request-1',
            },
        });
        expect(fetched.response.status).toBe(200);
        expect(fetched.data).toMatchObject({
            id: created.data!.id,
            name: 'Ada Lovelace',
        });
    });
});
