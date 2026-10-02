import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch';
import { nextAdapter } from '@kizunajs/next';
import { mcpPlugin } from '@kizunajs/mcp';
import { openApiPlugin } from '@kizunajs/openapi';
import { cmsPlugin, cmsRoutes } from '@kizunajs/cms';
import { nextRevalidate } from '@kizunajs/cms/next';
import { GuardSchema, analytics, jobs, routes, tags, user, member, inviteToken, scheduler } from '@kizunajs-demo/shared';
import { diagnostics } from './src/routes/diagnostics';
import { products, findExistingProductIds } from './src/routes/products';
import { contact } from './src/routes/contact';
import { editor, site } from './src/cms/identities';
import { db } from './src/db';
import { localMediaStorage } from './src/cms/media-storage';
import { pages } from './src/cms.pages';

/**
 * Content for the pages under `src/app`, in the demo's database, edited by
 * whoever signs in at /login.
 */
const cms = cmsPlugin({
    db,
    pages,
    auth: {
        identity: 'editor',
        roles: ['editor', 'admin'],
    },
    brands: {
        ProductId: {
            search: products.listProducts,
            label: (product) => product.name,
            image: (product) => product.imageUrl,
            exists: findExistingProductIds,
        },
    },
    media: process.env.CMS_S3_BUCKET === undefined ? { storage: localMediaStorage } : undefined,
    revalidate: nextRevalidate,
    environments: {
        local: {
            url: 'http://localhost:3030/api',
            headers: {
                authorization: `Bearer ${process.env.CMS_TOKEN ?? ''}`,
            },
        },
    },
});

/**
 * The shared routes every demo serves, plus the ones only this demo can answer.
 */
const served = {
    ...routes,
    diagnostics,
    products,
    contact,
    cms: cmsRoutes(cms),
};

export default defineConfig({
    adapter: nextAdapter(),
    typescript: {
        outputFile: './kizuna.types.ts',
    },
    tags,
    auth: {
        identities: {
            user,
            member,
            inviteToken,
            scheduler,
            editor,
            site,
        },
        guardSchema: GuardSchema,
    },
    requestContext: {
        analytics,
    },
    validation: {
        issueCodes: ['invalid_phone_number'],
    },
    routes: served,
    jobRunner: {
        mode: 'http',
    },
    jobs,
    clients: [
        fetchClient({
            output: './src/lib/api-client.generated.ts',
        }),
    ],
    plugins: [
        mcpPlugin({
            name: 'Kizuna demo',
        }),
        openApiPlugin({
            info: {
                title: 'Kizuna demo',
                version: '1.0.0',
            },
            setOperationId: true,
            docsPath: '/docs',
            jsonPath: '/openapi.json',
        }),
        cms,
    ],
});
