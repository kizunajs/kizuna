import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { createMcpServer } from '@kizunajs/mcp';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { cms } from './provider.js';
import { DOCUMENT_VIEW_URI } from './document-view.js';

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(() => ({
        userId: 'ada',
    }));

const pglite = new PGlite();
const config = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db: drizzle(pglite),
        pages: {},
        auth: {
            identity: 'editor',
        },
        preview: {
            url: 'https://site.example/',
        },
    }),
});

afterAll(async () => {
    await pglite.close();
});

const connect = async () => {
    const server = createMcpServer(config.api as never);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({
        name: 'test-client',
        version: '1.0.0',
    });
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    return client;
};

describe('the editor over MCP', () => {
    it('opens from the draft and describe tools, and keeps the preview link from the model', async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        const meta = Object.fromEntries(tools.map((tool) => [tool.name, tool._meta]));
        expect(meta['editing_describe']).toEqual({
            ui: {
                resourceUri: DOCUMENT_VIEW_URI,
            },
        });
        expect(meta['editing_globals_get_draft']).toEqual({
            ui: {
                resourceUri: DOCUMENT_VIEW_URI,
            },
        });
        expect(meta['editing_create_preview']).toEqual({
            ui: {
                visibility: ['app'],
            },
        });
        expect(meta['editing_pages_update_draft']).toBeUndefined();
    });

    it('serves the built editor, told where the site is and allowed to reach it', async () => {
        const client = await connect();
        const { resources } = await client.listResources();
        expect(resources.map((resource) => resource.uri)).toEqual([DOCUMENT_VIEW_URI]);
        expect(resources[0]?._meta).toEqual({
            ui: {
                csp: {
                    frameDomains: ['https://site.example'],
                    connectDomains: ['https://site.example'],
                    baseUriDomains: ['https://site.example'],
                    resourceDomains: ['https://site.example'],
                },
                prefersBorder: true,
            },
        });

        const { contents } = await client.readResource({
            uri: DOCUMENT_VIEW_URI,
        });
        const html = (contents[0] as { text: string }).text;
        expect(html).toContain('<div id="root"></div>');
        expect(html).toContain('{"siteUrl":"https://site.example"}');
        expect(html).not.toContain('__KIZUNA_CMS_VIEW_CONFIG__');
    });
});
