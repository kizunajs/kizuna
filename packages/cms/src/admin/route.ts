import { z } from 'zod';
import { route, type PluginApi } from 'kizunajs/plugin';
import { adapterContextOf, authenticate, flattenRoutes, rawResponse } from 'kizunajs/adapter';
import { toToolName } from 'kizunajs/generator';
import type { CmsService } from '../cms.js';
import { CONFIG_PLACEHOLDER, readBuilt, withStylesheet } from '../document-view.js';
import type { ResolvedCmsOptions } from '../options.js';
import { mcpRouteOf } from './chat.js';
import type { AdminConfig, AdminRoute, AdminSite, ChatConnection } from './config.js';
import { listOptionsOf } from './list-options.js';
import { dataFields } from '../field.js';

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
    chatToken: string | null = null,
    sees: (site: string) => boolean = () => true,
    allSites = true
): AdminConfig => ({
    siteName: options.name,
    siteUrl: originOf(options.preview?.url),
    apiPath: options.apiPath ?? '/api',
    adminPath: adminPathOf(options, base),
    role,
    signOutPath: options.auth.signOut === undefined ? (options.signOutPath ?? null) : sessionPathOf(options, base, 'sign-out'),
    signOutMethod: options.auth.signOut === undefined ? 'GET' : 'POST',
    routes: editingRoutesOf(api),
    groups: Object.fromEntries(
        [
            ...(options.collections ?? []),
            ...Object.values(options.sites?.entries ?? {}).flatMap((entry) => entry.collections ?? []),
            ...(options.views ?? []),
        ].flatMap((definition) => (definition.group === undefined ? [] : [[definition.name, definition.group]]))
    ),
    lists: listOptionsOf(
        options.collections ?? [],
        adminSitesOf(options).filter((site) => sees(site.key))
    ),
    chat: chatOf(api, options.apiPath ?? '/api', chatToken),
    sites: adminSitesOf(options).filter((site) => sees(site.key)),
    allSites,
    siteValues: siteValuesOf(options, sees),
});

/**
 * The country of a locale's region, like `NO` for `nb-NO`.
 */
const countryOf = (locale: string | undefined): string | null => {
    if (locale === undefined) return null;
    try {
        return new Intl.Locale(locale).region ?? null;
    } catch {
        return null;
    }
};

/**
 * The sites that set their own values on each shared global and collection:
 * every site for a field marked `perSite`, and the sites a field's `sites`
 * names.
 */
const siteValuesOf = (options: ResolvedCmsOptions, sees: (site: string) => boolean): Record<string, string[]> => {
    const keys = Object.keys(options.sites?.entries ?? {}).filter(sees);
    return Object.fromEntries(
        [...(options.globals ?? []), ...(options.collections ?? [])].flatMap((definition) => {
            const fields = dataFields(definition.fields);
            const setting = keys.filter((key) => fields.some((field) => field.perSite === true || field.sites?.includes(key) === true));
            return setting.length === 0 ? [] : [[definition.name, setting]];
        })
    );
};

/**
 * A site's icon as a full URL: a path resolves against the site's own `url`.
 */
export const siteIconOf = (icon: string, url: string): string | null => {
    try {
        return new URL(icon, url).toString();
    } catch {
        return null;
    }
};

/**
 * Every declared site, as the admin's switcher lists them.
 */
const adminSitesOf = (options: ResolvedCmsOptions): AdminSite[] =>
    Object.entries(options.sites?.entries ?? {}).map(([key, entry]) => {
        const values = options.sites!.values[key]!;
        return {
            key,
            label: values.label,
            icon: siteIconOf(values.icon, values.url),
            country: countryOf(values.locales?.[0]),
            pages: Object.keys(entry.pages ?? {}),
            globals: (entry.globals ?? []).map((definition) => ({
                name: definition.name,
                label: definition.label ?? null,
            })),
            collections: (entry.collections ?? []).map((definition) => ({
                name: definition.name,
                label: definition.label ?? null,
            })),
        };
    });

/**
 * The site this deployment shows, from `site` on `cms()`, when it names a
 * declared one.
 */
export const deployedSiteOf = (options: ResolvedCmsOptions): { label: string; icon: string | null } | undefined => {
    const key = options.site?.();
    const values = key === undefined ? undefined : options.sites?.values[key];
    return values === undefined
        ? undefined
        : {
              label: values.label,
              icon: siteIconOf(values.icon, values.url),
          };
};

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
 * The paths under the admin's own that name a screen, like
 * `/collections/employees/k3j9x2`, or a site's, like
 * `/uk/collections/events/k3j9x2`. The admin reads the screen from the
 * address, so the server answers each of them with the same page.
 */
const SCREEN_PATHS = {
    admin: '',
    adminSection: '/:section',
    adminEntry: '/:section/:name',
    adminEntryChild: '/:section/:name/:id',
    adminSiteEntryChild: '/:site/:section/:name/:id',
} satisfies Record<string, string>;

const SCREEN_PARAMS = ['site', 'section', 'name', 'id'];

/**
 * The query as the browser sent it, for the address an editor comes back to.
 */
const searchOf = (query: unknown): string => {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries((query ?? {}) as Record<string, unknown>)) {
        for (const each of Array.isArray(value) ? value : [value]) {
            if (typeof each === 'string') search.append(name, each);
        }
    }
    const text = search.toString();
    return text === '' ? '' : `?${text}`;
};

/**
 * The address the editor asked for: the admin's path, the screen under it
 * and the query.
 */
const askedFor = (adminPath: string, params: unknown, query: unknown): string => {
    const held = (params ?? {}) as Record<string, unknown>;
    const screen = SCREEN_PARAMS.flatMap((name) => (typeof held[name] === 'string' ? [`/${encodeURIComponent(held[name])}`] : [])).join('');
    return `${screen === '' ? adminPath : `${adminPath.replace(/\/+$/, '')}${screen}`}${searchOf(query)}`;
};

/**
 * `GET /admin`, or `adminPath`, and every screen under it: the CMS in a
 * browser tab, for an editor signed in as the editor identity. Anyone else
 * goes to sign in, and comes back to the screen they asked for after.
 */
const adminRoute = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi, base: '' | `/${string}`, screenPath: string) => {
    const adminPath = adminRoutePathOf(options, base);
    const path = (screenPath === '' ? adminPath : `${adminPath.replace(/\/+$/, '')}${screenPath}`) as `/${string}`;
    const params = SCREEN_PARAMS.filter((name) => screenPath.includes(`:${name}`));
    return route({
        method: 'GET',
        path,
        auth: false,
        summary: 'The admin, for a signed-in editor',
        ...(params.length === 0
            ? {}
            : {
                  pathParams: z.object(Object.fromEntries(params.map((name) => [name, z.string()]))),
              }),
        responses: {
            200: z.unknown(),
        },
    }).handler(async (args) => {
        const params = args.params as Record<string, string> | undefined;
        // A site's screens one level shallower match the shared patterns, with the site's key read as the section.
        const site =
            params?.['site'] ?? (options.sites?.entries[params?.['section'] ?? ''] === undefined ? undefined : params?.['section']);
        if (site !== undefined && options.sites?.entries[site] === undefined) {
            return rawResponse(
                new Response(null, {
                    status: 404,
                })
            );
        }
        const { signedIn, allowed } = await editorOf(service, options, api, args);
        const access = service.access({
            [options.auth.identity]: signedIn,
        });
        if (allowed && site !== undefined && !access.sees(site)) {
            return rawResponse(
                new Response(null, {
                    status: 404,
                })
            );
        }
        if (!allowed) {
            const location = signInLocationOf(options, base, askedFor(adminPathOf(options, base), args.params, args.query));
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
                embedded(
                    adminConfigFor(
                        options,
                        api,
                        base,
                        editingRoleOf(signedIn?.['role'], service.roles),
                        chatToken,
                        (key) => access.sees(key),
                        access.publishesShared
                    )
                )
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
};

/**
 * The admin's routes: its own path, and each depth of screen under it. A
 * site's screens go one deeper, so only a CMS with sites serves that depth.
 */
export const adminRoutes = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi, base: '' | `/${string}`) =>
    Object.fromEntries(
        Object.entries(SCREEN_PATHS)
            .filter(([, screenPath]) => options.sites !== undefined || !screenPath.includes(':site'))
            .map(([key, screenPath]) => [key, adminRoute(service, options, api, base, screenPath)])
    ) as Partial<Record<keyof typeof SCREEN_PATHS, ReturnType<typeof adminRoute>>>;
