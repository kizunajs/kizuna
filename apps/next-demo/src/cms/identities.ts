import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { k } from './k';
import { auth } from '../auth';

/**
 * An editor changes copy and media; an admin also changes the fields a page
 * marks `auth: { roles: 'admin' }`.
 */
export const editorRoles = Kizuna.roles(['editor', 'admin']);

const isEditorRole = (role: unknown): role is 'editor' | 'admin' => role === 'editor' || role === 'admin';

/**
 * A signed-in editor. better-auth reads the session from the browser's cookie,
 * or from the bearer an MCP client or the CLI sends.
 */
export const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            name: z.string(),
        }),
        roles: editorRoles,
    })
    .guard(async ({ request, deny }) => {
        const found = await auth.api.getSession({
            headers: request.headers,
        });
        if (found === null || !isEditorRole(found.user.role)) {
            return deny({
                status: 401,
                body: {
                    detail: 'Sign in as an editor.',
                },
            });
        }
        return {
            userId: found.user.email,
            name: found.user.name,
            role: found.user.role,
        };
    });

export const appRoles = Kizuna.roles(['app']);

/**
 * The app API's server, calling the CMS API to refresh the pages that show a
 * product it changed. The key lives in a server-only environment variable.
 */
export const app = k.identity
    .apiKey({
        name: 'x-cms-key',
        in: 'header',
        roles: appRoles,
    })
    .guard(({ apiKey, deny }) => {
        if (apiKey?.value !== (process.env.CMS_APP_KEY ?? 'dev-cms-app-key')) {
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                },
            });
        }
        return {
            role: 'app',
        };
    });
