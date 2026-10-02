import { createClient } from './cms-client.generated';

/**
 * The CMS API, as the app API calls it: with the key the CMS's `app`
 * identity checks, from a server-only environment variable.
 */
export const cmsClient = createClient({
    baseUrl: process.env.CMS_API_BASE_URL ?? 'http://localhost:3030/cms-api',
    baseHeaders: {
        'x-cms-key': process.env.CMS_APP_KEY ?? 'dev-cms-app-key',
    },
});
