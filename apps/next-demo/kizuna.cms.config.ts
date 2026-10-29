import { defineConfig } from 'kizunajs';
import { fetchClient } from '@kizunajs/fetch';
import { nextAdapter } from '@kizunajs/next';
import { mcpPlugin } from '@kizunajs/mcp';
import { openApiPlugin } from '@kizunajs/openapi';
import { cms } from '@kizunajs/cms';
import { app, editor } from './src/cms/identities';
import { Articles, Employees, Footer, Header } from './src/cms/content';
import { Products } from './src/cms/relationships';
import { localMediaStorage } from './src/cms/media-storage';
import { pages } from './src/cms.pages';
import { db } from './src/db';
import { editors } from './src/cms/people';
import { AppUsers } from './src/cms/app-users';
import { dashboard } from './src/cms/dashboard';
import { auth } from './src/auth';

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
        globals: [Header, Footer],
        collections: [Employees, Articles],
        relationships: [Products],
        views: [AppUsers],
        dashboard,
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            invalidate: 'app',
            signIn: ({ email, password, headers }) =>
                auth.api.signInEmail({
                    body: {
                        email,
                        password,
                    },
                    headers,
                    asResponse: true,
                }),
            signOut: ({ headers }) =>
                auth.api.signOut({
                    headers,
                    asResponse: true,
                }),
            chatToken: async ({ headers }) => {
                const found = await auth.api.getSession({
                    headers,
                });
                return found?.session.token;
            },
            people: {
                list: editors,
                imageOrigins: ['https://picsum.photos', 'https://fastly.picsum.photos'],
            },
        },
        reviews: {
            roles: 'admin',
            onReviewRequested: ({ documents, reviewers, requestedBy }) => {
                console.log(
                    `[demo] ${requestedBy.name} asked ${reviewers.map((reviewer) => reviewer.name).join(', ')} to review ${documents.map((document) => document.label).join(', ')}`
                );
            },
        },
        media: process.env.CMS_S3_BUCKET === undefined ? { storage: localMediaStorage } : undefined,
        apiPath: '/cms-api',
        adminPath: '/admin',
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
