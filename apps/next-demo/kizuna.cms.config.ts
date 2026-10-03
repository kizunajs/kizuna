import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch';
import { nextAdapter } from '@kizunajs/next';
import { mcpPlugin } from '@kizunajs/mcp';
import { openApiPlugin } from '@kizunajs/openapi';
import { cms } from '@kizunajs/cms';
import { app, editor } from './src/cms/identities';
import { Articles, Employees, Site } from './src/cms/content';
import { Products } from './src/cms/relationships';
import { localMediaStorage } from './src/cms/media-storage';
import { pages } from './src/cms.pages';
import { db } from './src/db';

/**
 * The CMS API: editors, the content they change, and an MCP endpoint of its
 * own at `/cms-api/mcp`. It shares nothing with the app API but the ids in
 * `src/models.ts`.
 */
export default defineConfig({
    adapter: nextAdapter(),
    typescript: {
        outputFile: './src/cms/kizuna.types.ts',
    },
    auth: {
        identities: {
            editor,
            app,
        },
    },
    content: cms({
        db,
        pages,
        globals: [Site],
        collections: [Employees, Articles],
        relationships: [Products],
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            invalidate: 'app',
        },
        media: process.env.CMS_S3_BUCKET === undefined ? { storage: localMediaStorage } : undefined,
        apiPath: '/cms-api',
        signInPath: '/login',
        preview: {
            url: process.env.BETTER_AUTH_URL ?? 'http://localhost:3030',
        },
        environments: {
            local: {
                url: 'http://localhost:3030/cms-api',
                headers: {
                    authorization: `Bearer ${process.env.CMS_TOKEN ?? ''}`,
                },
            },
        },
    }),
    clients: [
        fetchClient({
            output: './src/lib/cms-client.generated.ts',
        }),
    ],
    plugins: [
        mcpPlugin({
            name: 'Kizuna demo content',
        }),
        openApiPlugin({
            info: {
                title: 'Kizuna demo content',
                version: '1.0.0',
            },
            setOperationId: true,
            docsPath: '/docs',
            jsonPath: '/openapi.json',
        }),
    ],
});
