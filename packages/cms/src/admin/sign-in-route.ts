import { z } from 'zod';
import { route, type PluginApi } from 'kizunajs/plugin';
import { rawResponse } from 'kizunajs/adapter';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
import type { CmsService } from '../cms.js';
import { CONFIG_PLACEHOLDER, readBuilt, withStylesheet } from '../document-view.js';
import type { ResolvedCmsOptions } from '../options.js';
import { PREVIEW_COOKIE } from '../preview-token.js';
import {
    adminPathOf,
    adminRoutePathOf,
    deployedSiteOf,
    editorOf,
    embedded,
    headersOf,
    sessionPathOf,
    signInLocationOf,
    type RequestHeaders,
} from './route.js';
import type { SignInConfig } from './sign-in-config.js';

const firstOf = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/**
 * The request came from a page on this site. A browser names the page's
 * origin on every POST, so a form on another site cannot sign an editor in
 * to an account of its choosing, or out.
 */
export const isSameOrigin = (headers: RequestHeaders): boolean => {
    const origin = firstOf(headers['origin']);
    const host = firstOf(headers['x-forwarded-host'])?.split(',')[0]?.trim() ?? firstOf(headers['host']);
    if (origin === undefined || host === undefined) return false;
    try {
        return new URL(origin).host === host;
    } catch {
        return false;
    }
};

/**
 * `response`, carrying every cookie the app's auth set.
 */
const withCookies = (response: Response, from: Response): Response => {
    for (const cookie of from.headers.getSetCookie()) response.headers.append('set-cookie', cookie);
    return response;
};

const answered = (response: unknown, option: 'signIn' | 'signOut'): Response => {
    if (response instanceof Response) return response;
    throw new Error(`auth.${option} on cms() returns the Response your auth answers with, so its cookies reach the browser.`);
};

const problem = (status: 401 | 403, title: string, detail: string): Response =>
    Response.json(
        {
            type: 'about:blank',
            title,
            status,
            detail,
        },
        {
            status,
            headers: {
                'content-type': 'application/problem+json',
                'cache-control': 'no-store',
            },
        }
    );

const crossOrigin = (): Response => problem(403, 'Forbidden', 'Send this from a page on this site.');

/**
 * A path on this site, or `fallback` for anything else, so signing in never
 * sends someone off it. A backslash counts as a slash, as browsers read it.
 */
const pathOnSite = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value.startsWith('/') && !/^\/[/\\]/.test(value) ? value : fallback;

const SignInBodySchema = z.object({
    email: z.string().min(1),
    password: z.string().min(1),
});

/**
 * `GET /admin/login`, under `adminPath`: the admin's sign-in screen. An editor
 * signed in already goes on to `next`.
 */
export const signInScreenRoute = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi, base: '' | `/${string}`) =>
    route({
        method: 'GET',
        path: `${adminRoutePathOf(options, base).replace(/\/+$/, '')}/login` as `/${string}`,
        auth: false,
        summary: "The admin's sign-in screen",
        query: z.object({
            next: z.string().optional(),
        }),
        responses: {
            200: z.unknown(),
        },
    }).handler(async (args) => {
        const next = pathOnSite((args.query as { next?: string }).next, adminPathOf(options, base));
        const { signedIn, allowed } = await editorOf(service, options, api, args);
        if (allowed) {
            return rawResponse(
                new Response(null, {
                    status: 307,
                    headers: {
                        location: next,
                    },
                })
            );
        }
        const deployed = deployedSiteOf(options);
        const config: SignInConfig = {
            signInPath: sessionPathOf(options, base, 'sign-in'),
            next,
            noAccess: signedIn !== undefined,
            siteName: deployed?.label ?? options.name,
            ...(deployed?.icon === undefined || deployed.icon === null
                ? {}
                : {
                      siteIcon: deployed.icon,
                  }),
        };
        const page = withStylesheet(
            (await readBuilt('sign-in.html')).replace(CONFIG_PLACEHOLDER, () => embedded(config)),
            options.adminCss
        );
        return rawResponse(
            new Response(page, {
                status: 200,
                headers: {
                    'content-type': 'text/html; charset=utf-8',
                    'cache-control': 'no-store',
                    'content-security-policy': "frame-ancestors 'none'",
                },
            })
        );
    });

/**
 * `POST /sign-in`: the sign-in screen's email and password, handed to
 * `auth.signIn`. Its cookies come back on a `204`, and any answer outside 2xx
 * is a `401` that says no more than that the two do not match.
 */
export const signInRoute = (options: ResolvedCmsOptions, base: '' | `/${string}`) =>
    route({
        method: 'POST',
        path: `${base}/sign-in`,
        auth: false,
        summary: 'Sign an editor in to the admin',
        body: SignInBodySchema,
        responses: {
            204: z.void(),
            401: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
        },
    }).handler(async (args) => {
        const headers = args.headers as RequestHeaders;
        if (!isSameOrigin(headers)) return rawResponse(crossOrigin());
        const body = args.body as z.output<typeof SignInBodySchema>;
        const response = answered(
            await options.auth.signIn!({
                email: body.email,
                password: body.password,
                headers: headersOf(headers),
            }),
            'signIn'
        );
        if (!response.ok) return rawResponse(problem(401, 'Unauthorized', 'Wrong email or password.'));
        return rawResponse(
            withCookies(
                new Response(null, {
                    status: 204,
                    headers: {
                        'cache-control': 'no-store',
                    },
                }),
                response
            )
        );
    });

/**
 * `POST /sign-out`: the admin's Sign out. It ends the session through
 * `auth.signOut`, closes draft mode, and sends the editor to sign in again.
 */
export const signOutRoute = (service: CmsService, options: ResolvedCmsOptions, base: '' | `/${string}`) =>
    route({
        method: 'POST',
        path: `${base}/sign-out`,
        auth: false,
        summary: 'Sign an editor out of the admin',
        responses: {
            303: z.void(),
            403: ProblemDetailsSchema,
        },
    }).handler(async (args) => {
        const headers = args.headers as RequestHeaders;
        if (!isSameOrigin(headers)) return rawResponse(crossOrigin());
        const response = answered(
            await options.auth.signOut!({
                headers: headersOf(headers),
            }),
            'signOut'
        );
        const runtime = service.runtime;
        if (runtime !== undefined) {
            (await runtime.draftMode()).disable();
            (await runtime.cookies()).delete(PREVIEW_COOKIE);
        }
        const admin = adminPathOf(options, base);
        return rawResponse(
            withCookies(
                new Response(null, {
                    status: 303,
                    headers: {
                        location: signInLocationOf(options, base, admin) ?? admin,
                    },
                }),
                response
            )
        );
    });
