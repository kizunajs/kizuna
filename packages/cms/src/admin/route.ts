import { z } from 'zod';
import { route, type PluginApi } from 'kizunajs/plugin';
import { adapterContextOf, authenticate, flattenRoutes, rawResponse } from 'kizunajs/adapter';
import { toToolName } from 'kizunajs/generator';
import type { CmsService } from '../cms.js';
import { CONFIG_PLACEHOLDER, readBuilt, withStylesheet } from '../document-view.js';
import type { ResolvedCmsOptions } from '../options.js';
import { mcpRouteOf } from './chat.js';
import type { AdminConfig, AdminRoute, ChatConnection } from './config.js';
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
 * Where the browser opens the admin's sign-in screen, from the site's root.
 */
export const signInScreenOf = (options: ResolvedCmsOptions, base: '' | `/${string}`): string =>
    `${adminPathOf(options, base).replace(/\/+$/, '')}/login`;

/**
 * Where a signed-out editor on their way to `next` is sent: the admin's own
 * sign-in screen when `auth.signIn` is set, then `signInPath`, or nowhere.
 */
export const signInLocationOf = (options: ResolvedCmsOptions, base: '' | `/${string}`, next: string): string | undefined => {
    const signIn = options.auth.signIn === undefined ? options.signInPath : signInScreenOf(options, base);
    return signIn === undefined ? undefined : `${signIn}?next=${encodeURIComponent(next)}`;
};

/**
 * Where the CMS's sign-in and sign-out routes are served, from the site's
 * root.
 */
export const sessionPathOf = (options: ResolvedCmsOptions, base: '' | `/${string}`, action: 'sign-in' | 'sign-out'): string =>
    `${options.apiPath ?? '/api'}${base}/${action}`;

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

export type RequestHeaders = Record<string, string | string[] | undefined>;

/**
 * The request's headers as the app's auth reads them.
 */
export const headersOf = (headers: RequestHeaders): Headers => {
    const converted = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        for (const each of Array.isArray(value) ? value : value === undefined ? [] : [value]) converted.append(name, each);
    }
    return converted;
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

export const adminConfigFor = (
    options: ResolvedCmsOptions,
    api: PluginApi,
    base: '' | `/${string}`,
    role: string | null = null,
    chatToken: string | null = null
): AdminConfig => ({
    siteUrl: originOf(options.preview?.url),
    apiPath: options.apiPath ?? '/api',
    role,
    signOutPath: options.auth.signOut === undefined ? (options.signOutPath ?? null) : sessionPathOf(options, base, 'sign-out'),
    signOutMethod: options.auth.signOut === undefined ? 'GET' : 'POST',
    routes: editingRoutesOf(api),
    groups: Object.fromEntries(
        [...(options.collections ?? []), ...(options.views ?? [])].flatMap((definition) =>
            definition.group === undefined ? [] : [[definition.name, definition.group]]
        )
    ),
    lists: listOptionsOf(options.collections ?? []),
    chat: chatOf(api, options.apiPath ?? '/api', chatToken),
});

const chatOf = (api: PluginApi, apiPath: string, token: string | null): ChatConnection | null => {
    const route = mcpRouteOf(api, apiPath);
    return route === undefined
        ? null
        : {
              ...route,
              token,
          };
};

/**
 * The config as the page's JSON script holds it, with `<` escaped so no value
 * can close the script.
 */
export const embedded = (config: unknown): string => JSON.stringify(config).replaceAll('<', '\\u003c');

/**
 * Who sent the request, as the editor identity sees them, and whether they
 * hold a role that edits.
 */
export const editorOf = async (
    service: CmsService,
    options: ResolvedCmsOptions,
    api: PluginApi,
    args: {
        headers: unknown;
        query?: unknown;
    }
): Promise<{
    signedIn: Record<string, unknown> | undefined;
    allowed: boolean;
}> => {
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
    return {
        signedIn,
        allowed,
    };
};

/**
 * `GET /admin`, or `adminPath`: the CMS in a browser tab, for an editor signed
 * in as the editor identity. Anyone else goes to sign in, and comes back
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
        const { signedIn, allowed } = await editorOf(service, options, api, args);
        if (!allowed) {
            const location = signInLocationOf(options, base, adminPathOf(options, base));
            if (location === undefined) {
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
                        location,
                    },
                })
            );
        }
        const chatToken =
            (await options.auth.chatToken?.({
                headers: headersOf(args.headers as RequestHeaders),
            })) ?? null;
        const page = withStylesheet(
            (await readBuilt('admin.html')).replace(CONFIG_PLACEHOLDER, () =>
                embedded(adminConfigFor(options, api, base, editingRoleOf(signedIn?.['role'], service.roles), chatToken))
            ),
            options.adminCss
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
