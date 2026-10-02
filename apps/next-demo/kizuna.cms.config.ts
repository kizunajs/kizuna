import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch';
import { nextAdapter } from '@kizunajs/next';
import { mcpPlugin } from '@kizunajs/mcp';
import { openApiPlugin } from '@kizunajs/openapi';
import { cmsPlugin, cmsRoutes } from '@kizunajs/cms';
import { nextRevalidate } from '@kizunajs/cms/next';
import { app, editor } from './src/cms/identities';
import { articles, employees, site } from './src/cms/content';
import { localMediaStorage } from './src/cms/media-storage';
import { pages } from './src/cms.pages';
import { db } from './src/db';
import { apiClient } from './src/lib/api-client';

/**
 * Products come from the app API, through its generated client, so the CMS
 * imports none of the app's routes.
 */
const listProducts = async (query?: string) => {
    const result = await apiClient.products.listProducts({
        query: {
            q: query,
        },
    });
    return result.status === 200 ? result.body.products : [];
};

/**
 * Content for the pages under `src/app`, in the demo's database, edited by
 * whoever signs in at /login.
 */
const cms = cmsPlugin({
    db,
    pages,
    globals: [site],
    collections: [employees, articles],
    auth: {
        identity: 'editor',
        roles: ['editor', 'admin'],
        invalidate: 'app',
    },
    brands: {
        ProductId: {
            search: listProducts,
            label: (product) => product.name,
            image: (product) => product.imageUrl,
            exists: async (ids) => {
                const known = new Set<string>((await listProducts()).map((product) => product.id));
                return ids.filter((id) => known.has(id));
            },
        },
    },
    media: process.env.CMS_S3_BUCKET === undefined ? { storage: localMediaStorage } : undefined,
    revalidate: nextRevalidate,
    path: '/',
    apiPath: '/cms-api',
    environments: {
        local: {
            url: 'http://localhost:3030/cms-api',
            headers: {
                authorization: `Bearer ${process.env.CMS_TOKEN ?? ''}`,
            },
        },
    },
});

/**
 * The CMS API: editors, the CMS routes, and an MCP endpoint of its own at
 * `/cms-api/mcp`. It shares nothing with the app API but the ids in
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
    routes: {
        cms: cmsRoutes(cms),
    },
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
        cms,
    ],
});
