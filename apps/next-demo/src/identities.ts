import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { k } from './k';
import { auth } from './auth';

export const siteRoles = Kizuna.roles(['site']);

/**
 * The site's own server, for cached renders that read app data no visitor may.
 * The key lives in a server-only environment variable, and the role reads
 * only.
 */
export const site = k.identity
    .apiKey({
        name: 'x-site-key',
        in: 'header',
        roles: siteRoles,
    })
    .guard(({ apiKey, deny }) => {
        if (apiKey?.value !== (process.env.SITE_API_KEY ?? 'dev-site-key')) {
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                    code: 'unauthenticated',
                },
            });
        }
        return {
            role: 'site',
        };
    });

export const staffRoles = Kizuna.roles(['admin']);

/**
 * Someone who runs the shop, signed in through the same accounts as the CMS.
 * Only admins change products.
 */
export const staff = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
        roles: staffRoles,
    })
    .guard(async ({ request, deny }) => {
        const found = await auth.api.getSession({
            headers: request.headers,
        });
        if (found === null || found.user.role !== 'admin') {
            return deny({
                status: 401,
                body: {
                    detail: 'Sign in as an admin.',
                    code: 'unauthenticated',
                },
            });
        }
        return {
            userId: found.user.email,
            role: 'admin',
        };
    });
