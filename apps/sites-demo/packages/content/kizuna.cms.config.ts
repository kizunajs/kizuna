import { anthropic } from '@ai-sdk/anthropic';
import { defineConfig } from 'kizunajs';
import { nextAdapter } from '@kizunajs/next';
import { mcpPlugin } from '@kizunajs/mcp';
import { cms } from '@kizunajs/cms';
import { fetchClient, fetchIds } from '@kizunajs/fetch';
import { editor } from './src/identities';
import { Employees } from './src/employees';
import { Offices } from './src/offices';
import { Articles } from './src/articles';
import { PrivacyPolicy } from './src/privacy-policy';
import { sites } from './src/sites';
import { db } from './src/db';
import { editors, inviteEditor, setEditorSites } from './src/people';
import { localMediaStorage } from './src/media-storage';
import { auth } from './src/auth';
import { dashboard, overview } from './src/dashboard';
import { partner, partners } from './src/partners';

/**
 * The site this deployment shows. The setup script names none, and reads as the group.
 */
const current = Object.entries(sites.values).find(([key]) => key === process.env.KIZUNA_SITE)?.[1] ?? sites.values.group;

/**
 * Hagen's content: the employees, offices and privacy policy every site
 * shares, and the three sites beside them. Every app mounts this config, and
 * `KIZUNA_SITE` says which site a deployment shows.
 */
export default defineConfig({
    adapter: nextAdapter(),
    typescript: {
        outputFile: './src/kizuna.types.ts',
    },
    auth: {
        identities: {
            editor,
            partner,
        },
    },
    jobRunner: {
        mode: 'in-process',
    },
    content: cms({
        name: 'Hagen',
        db,
        locales: ['en', 'nb'],
        ...(process.env.ANTHROPIC_API_KEY === undefined
            ? {}
            : {
                  translate: {
                      model: anthropic('claude-sonnet-5-5'),
                  },
              }),
        collections: [Employees, Offices, Articles],
        globals: [PrivacyPolicy],
        sites,
        partners,
        dashboard,
        overview,
        site: () => process.env.KIZUNA_SITE,
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (editor) => editor.sites,
            read: 'partner',
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
                invite: inviteEditor,
                setSites: setEditorSites,
            },
        },
        reviews: {
            roles: 'admin',
        },
        media: {
            storage: localMediaStorage,
        },
        apiPath: '/api',
        adminPath: '/admin',
        preview: {
            url: current.url,
        },
    }),
    clients: [
        fetchClient({
            output: '../../uk-content/src/index.ts',
            groups: ['content.sites.uk'],
        }),
        fetchIds({
            output: '../../uk-content/src/ids.ts',
            groups: ['content.sites.uk'],
        }),
    ],
    plugins: [
        mcpPlugin({
            name: 'Hagen content',
        }),
    ],
});
