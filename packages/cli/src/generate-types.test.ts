import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigSyntaxError, generateConfigTypes } from './generate-types.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');

describe('generateConfigTypes', () => {
    it('writes the adapter as the return of its factory', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { expressAdapter } from '@ts-kizuna/express';
import { routes } from './src/routes';

export default defineConfig({
    adapter: expressAdapter(),
    routes,
});
`);
        expect(types).toContain("import type { expressAdapter } from '@ts-kizuna/express';");
        expect(types).toContain('adapter: ReturnType<typeof expressAdapter>;');
    });

    /**
     * Routes are read at runtime, so typing against them would make the config a
     * prerequisite for declaring the routes it serves.
     */
    it('leaves routes and clients out, and imports nothing for them', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { swiftClient } from '@ts-kizuna/swift';
import { routes } from './src/routes';

export default defineConfig({
    routes,
    clients: [swiftClient({ output: './APIClient.swift' })],
});
`);
        expect(types).not.toContain('routes');
        expect(types).not.toContain('clients');
        expect(types).not.toContain('@ts-kizuna/swift');
    });

    it('expands identities and request context per key', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { user, member } from './src/identities';
import { analytics } from './src/request-context';

export default defineConfig({
    identities: { user, member },
    requestContext: { analytics },
});
`);
        expect(types).toContain('        user: typeof user;');
        expect(types).toContain('        member: typeof member;');
        expect(types).toContain('        analytics: typeof analytics;');
    });

    it('writes issue codes as a union of the literals', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';

export default defineConfig({
    issueCodes: ['invalid_phone_number', 'unreachable_host'],
});
`);
        expect(types).toContain("issueCodes: 'invalid_phone_number' | 'unreachable_host';");
    });

    /**
     * A tuple, not an array: each plugin keeps its place so a handler reaches it
     * under its own slug.
     */
    it('writes plugins as a tuple in the order they are installed', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { mcpPlugin } from '@ts-kizuna/mcp';
import { openApiPlugin } from '@ts-kizuna/openapi';

export default defineConfig({
    plugins: [mcpPlugin({ name: 'My API' }), openApiPlugin({ info: { title: 'My API', version: '1.0.0' } })],
});
`);
        expect(types).toContain('plugins: [ReturnType<typeof mcpPlugin>, ReturnType<typeof openApiPlugin>];');
    });

    it('keeps an aliased import pointing at the name its module exports', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { tags as apiTags } from './src/tags';

export default defineConfig({
    tags: apiTags,
});
`);
        expect(types).toContain("import type { tags as apiTags } from './src/tags';");
        expect(types).toContain('tags: typeof apiTags;');
    });

    it('follows a default export through the const it was named as', () => {
        const types = generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { tags } from './src/tags';

const config = defineConfig({ tags });

export default config;
`);
        expect(types).toContain('tags: typeof tags;');
    });

    it('refuses a config with no default export', () => {
        expect(() => generateConfigTypes('export const config = defineConfig({});')).toThrow(ConfigSyntaxError);
    });

    it('refuses an issue code that is not a literal', () => {
        expect(() =>
            generateConfigTypes(`
import { defineConfig } from '@ts-kizuna/core';
import { codes } from './codes';

export default defineConfig({ issueCodes: codes });
`)
        ).toThrow(/array of string literals/);
    });

    /**
     * The demos are the worked examples the docs are written from, so the
     * generator has to reproduce each one exactly.
     */
    it.each(['express-demo', 'fastify-demo', 'hono-demo', 'next-demo'])('reproduces %s/kizuna.types.ts', (app) => {
        const configPath = path.join(ROOT, 'apps', app, 'kizuna.config.ts');
        const expected = fs.readFileSync(path.join(ROOT, 'apps', app, 'kizuna.types.ts'), 'utf8');
        expect(generateConfigTypes(fs.readFileSync(configPath, 'utf8'), configPath)).toEqual(expected);
    });
});
