import { defineConfig } from 'kizunajs';
import { nextAdapter } from '@kizunajs/next';
import { mcpPlugin } from '@kizunajs/mcp';
import { cms } from '@kizunajs/cms';
import { editor } from './src/identities';
import { Employees } from './src/employees';
import { Offices } from './src/offices';
import { PrivacyPolicy } from './src/privacy-policy';
import { sites } from './src/sites';
import { db } from './src/db';
import { editors } from './src/people';
import { localMediaStorage } from './src/media-storage';
import { auth } from './src/auth';

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
        },
    },
    content: cms({
        name: 'Hagen',
        db,
        collections: [Employees, Offices],
        globals: [PrivacyPolicy],
        sites,
        site: () => process.env.KIZUNA_SITE,
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            // TODO(sites): `sites: (editor) => editor.sites`, so Una, Sam, Nils and Kari see their own site.
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
    plugins: [
        mcpPlugin({
            name: 'Hagen content',
        }),
    ],
});
