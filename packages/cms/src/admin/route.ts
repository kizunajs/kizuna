import { z } from 'zod';
import { route, type PluginApi } from 'kizunajs/plugin';
import { adapterContextOf, authenticate, flattenRoutes, rawResponse } from 'kizunajs/adapter';
import { toToolName } from 'kizunajs/generator';
import type { CmsService } from '../cms.js';
import { CONFIG_PLACEHOLDER, readBuilt } from '../document-view.js';
import type { ResolvedCmsOptions } from '../options.js';
import type { AdminConfig, AdminRoute } from './config.js';
import { listOptionsOf } from './list-options.js';

/**
 * Where the admin is served under the CMS's `path`, unless `adminPath` names
 * another.
 */
export const ADMIN_PATH = '/admin';

/**
 * Where the browser opens the admin, from the site's root.
 */
export const adminPathOf = (options: ResolvedCmsOptions, base: '' | `/${string}`): string =>
    options.adminPath ?? `${options.apiPath ?? '/api'}${base}${ADMIN_PATH}`;

/**
 * The admin route's path: within the API when `adminPath` is under `apiPath`,
 * and the whole of it otherwise, for a mount at the site's root.
 */
export const adminRoutePathOf = (options: ResolvedCmsOptions, base: '' | `/${string}`): `/${string}` => {
    const adminPath = adminPathOf(options, base);
    const mount = (options.apiPath ?? '/api').replace(/\/+$/, '');
    if (adminPath === mount) return '/';
    return (adminPath.startsWith(`${mount}/`) ? adminPath.slice(mount.length) : adminPath) as `/${string}`;
};

const originOf = (url: string | undefined): string | null => {
    if (url === undefined) return null;
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
};

/**
 * Every editing route, by the tool name the editor's components call it by.
 */
export const editingRoutesOf = (api: PluginApi): Record<string, AdminRoute> =>
    Object.fromEntries(
        flattenRoutes(api.routes)
            .filter((entry) => entry.routeKey.startsWith('editing.'))
            .map((entry) => [
                toToolName(entry.routeKey),
                {
                    method: entry.route.method,
                    path: entry.route.path,
                },
            ])
    );

/**
 * The role in an editor's claims that lets them edit, or their first one when
 * every role may.
 */
export const editingRoleOf = (role: unknown, editingRoles: readonly string[] | undefined): string | null => {
    const held = (Array.isArray(role) ? role : [role]).filter((candidate): candidate is string => typeof candidate === 'string');
    return held.find((candidate) => editingRoles === undefined || editingRoles.includes(candidate)) ?? null;
};

export const adminConfigFor = (options: ResolvedCmsOptions, api: PluginApi, role: string | null = null): AdminConfig => ({
    siteUrl: originOf(options.preview?.url),
    apiPath: options.apiPath ?? '/api',
    role,
    signOutPath: options.signOutPath ?? null,
    routes: editingRoutesOf(api),
    groups: Object.fromEntries(
        [...(options.collections ?? []), ...(options.views ?? [])].flatMap((definition) =>
            definition.group === undefined ? [] : [[definition.name, definition.group]]
        )
    ),
    lists: listOptionsOf(options.collections ?? []),
});

/**
 * The config as the page's JSON script holds it, with `<` escaped so no value
 * can close the script.
 */
const embedded = (config: AdminConfig): string => JSON.stringify(config).replaceAll('<', '\\u003c');

/**
 * `GET /admin`, or `adminPath`: the CMS in a browser tab, for an editor signed
 * in as the editor identity. Anyone else goes to `signInPath`, and comes back
 * after.
 */
export const adminRoute = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi, base: '' | `/${string}`) =>
    route({
        method: 'GET',
        path: adminRoutePathOf(options, base),
        auth: false,
        summary: 'The admin, for a signed-in editor',
        responses: {
            200: z.unknown(),
        },
    }).handler(async (args) => {
        const signedIn = await authenticate(
            api,
            options.auth.identity,
            {
                headers: args.headers as Record<string, string | string[] | undefined>,
                query: args.query,
            },
            adapterContextOf(args as unknown as Record<string, unknown>)
        );
        const role = signedIn?.['role'];
        const allowed =
            signedIn !== undefined &&
            (service.roles === undefined || (Array.isArray(role) ? role : [role]).some((held) => service.roles!.includes(held as string)));
        if (!allowed) {
            if (options.signInPath === undefined) {
                return rawResponse(
                    new Response('Sign in as an editor first.', {
                        status: 401,
                    })
                );
            }
            return rawResponse(
                new Response(null, {
                    status: 307,
                    headers: {
                        location: `${options.signInPath}?next=${encodeURIComponent(adminPathOf(options, base))}`,
                    },
                })
            );
        }
        const page = (await readBuilt('admin.html')).replace(CONFIG_PLACEHOLDER, () =>
            embedded(adminConfigFor(options, api, editingRoleOf(role, service.roles)))
        );
        return rawResponse(
            new Response(page, {
                status: 200,
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'cache-control': 'no-store',
                },
            })
        );
    });
