import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import type { CmsService } from './cms.js';
import { linkHref } from './link-targets.js';
import { DEFAULT_SITE } from './options.js';
import type { RedirectTable, ServedRedirect } from './redirect-match.js';

export const RedirectTableSchema = Kizuna.model({
    title: 'CMS.RedirectTable',
    schema: z.object({
        version: z.int().describe("Moves on with every change to the site's redirects, and is the response's ETag."),
        redirects: z.array(
            z.object({
                from: z
                    .string()
                    .describe('The path a visitor asks for, language prefix included, with a query when the old address had one.'),
                to: z.string().describe('A path on the site, or an absolute URL.'),
                status: z.literal([307, 308]).describe('308 for an address that moved for good, 307 for one that moved for now.'),
            })
        ),
    }),
});

/**
 * A site's redirects as visitors meet them: a page or an item resolved to
 * where it is served now, in the redirect's language, and a redirect whose
 * page or item is unpublished, in the trash or deleted left out.
 */
export const servedRedirects = async (cms: CmsService, site: string): Promise<RedirectTable> => {
    // The version is read first, so a change landing in between is fetched again.
    const version = await cms.redirects.version(site);
    const redirects: ServedRedirect[] = [];
    for (const redirect of await cms.redirects.list(site)) {
        const to =
            redirect.to.type === 'document'
                ? await linkHref(
                      cms,
                      redirect.to.ref,
                      {
                          site,
                          locale: redirect.locale ?? undefined,
                      },
                      'published'
                  )
                : redirect.to.type === 'path'
                  ? redirect.to.path
                  : redirect.to.url;
        if (to === undefined || to === redirect.from) continue;
        redirects.push({
            from: redirect.from,
            to,
            status: redirect.status,
        });
    }
    return {
        version,
        redirects,
    };
};

/**
 * The `ETag` of a site's redirects: their version.
 */
export const redirectsEtag = (version: number): string => `"${version}"`;

type RedirectsGuarded = (
    fn: (
        cms: CmsService,
        args: {
            headers: Record<string, string | string[] | undefined>;
        }
    ) => Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>
) => unknown;

/**
 * `GET /content/sites/:site/redirects`, or `/content/redirects` without
 * sites: the site's redirects for a proxy to serve. Public, since every
 * visitor meets them anyway. A proxy sends the `ETag` back as
 * `If-None-Match` and gets `304` until the version moves on.
 */
export const redirectsRoute = (input: { site: string; base: '' | `/${string}`; guarded: RedirectsGuarded }) =>
    route({
        method: 'GET',
        path: input.site === DEFAULT_SITE ? `${input.base}/content/redirects` : `${input.base}/content/sites/${input.site}/redirects`,
        auth: false,
        summary: input.site === DEFAULT_SITE ? "List the site's redirects" : `List the ${input.site} site's redirects`,
        description:
            'Each old address and where it goes now, for a proxy to answer with a real 307 or 308 before the site renders anything. Send the ETag back as If-None-Match to get 304 until something changes.',
        headers: z.object({
            'if-none-match': z.string().optional(),
        }),
        responses: {
            200: {
                body: RedirectTableSchema,
                headers: z.object({
                    etag: z.string(),
                }),
                cache: {
                    scope: 'public',
                    noCache: true,
                },
            },
            304: {
                body: z.void(),
                headers: z.object({
                    etag: z.string(),
                }),
                cache: {
                    scope: 'public',
                    noCache: true,
                },
            },
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const etag = redirectsEtag(await cms.redirects.version(input.site));
            const asked = args.headers['if-none-match'];
            const held = (Array.isArray(asked) ? asked.join(',') : (asked ?? '')).split(',').map((tag) => tag.trim().replace(/^W\//, ''));
            if (held.includes(etag) || held.includes('*')) {
                return {
                    status: 304,
                    headers: {
                        etag,
                    },
                };
            }
            const table = await servedRedirects(cms, input.site);
            return {
                status: 200,
                body: table,
                headers: {
                    etag: redirectsEtag(table.version),
                },
            };
        }) as never
    );
