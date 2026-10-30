import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { k } from './k';
import { auth } from './auth';

/**
 * An editor changes copy; an admin also publishes what needs a review.
 */
export const editorRoles = Kizuna.roles(['editor', 'admin']);

const EditorRoleSchema = z.enum(['editor', 'admin']);

/**
 * The role an editor has on each site they work on, like `{ uk: 'editor' }`.
 */
export const EditorSitesSchema = z.record(z.string(), EditorRoleSchema);

/**
 * The roles stored on a user, by site.
 */
export const readSites = (stored: unknown): z.output<typeof EditorSitesSchema> => {
    try {
        const parsed = EditorSitesSchema.safeParse(JSON.parse(String(stored)));
        return parsed.success ? parsed.data : {};
    } catch {
        return {};
    }
};

/**
 * A signed-in editor. better-auth reads the session from the browser's cookie,
 * or from the bearer an MCP client or the CLI sends. Their role covers the
 * shared content, and `sites` names their role on each site.
 */
export const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            name: z.string(),
            sites: EditorSitesSchema,
        }),
        roles: editorRoles,
    })
    .guard(async ({ request, deny }) => {
        const found = await auth.api.getSession({
            headers: request.headers,
        });
        const role = EditorRoleSchema.safeParse(found?.user.role);
        if (found === null || !role.success) {
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
            role: role.data,
            sites: readSites(found.user.sites),
        };
    });
