import { z } from 'zod';
import type { RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import { CmsHttpError, type CmsService } from './cms.js';
import type { EditingArgs, Guarded } from './action-routes.js';
import { DEFAULT_SITE, type Person } from './options.js';
import { formatRef, parseRef, sourceRefOf } from './refs.js';
import { linkedRef, linkHref } from './link-targets.js';
import { documentLabel, peopleOf, viewOf } from './reviews.js';
import { fromProblem, planRedirect, targetProblem } from './redirect-edits.js';
import { addressesOf, publishedCopy } from './redirects.js';
import type { RedirectRow, RedirectTarget } from './storage/redirect-store.js';
import { CreateRedirectBodySchema, RedirectListSchema, RedirectSchema, UpdateRedirectBodySchema } from './wire.js';

const RedirectParamsSchema = z.object({
    id: z.string().describe('The redirect, by the id the list answers.'),
});

/**
 * The language a path is in on a site, from its prefix, or the site's first
 * language. `null` on a site without languages.
 */
export const localeOfPath = (cms: CmsService, site: string, path: string): string | null =>
    cms.unprefixed(path, site).locale ?? cms.sourceLocaleOf(site) ?? null;

/**
 * The page published at a path of a site, by name, or `undefined` when no
 * page answers there. Only the path counts, since a redirect from it with a
 * query would take over the page for those requests.
 */
export const pageLiveAt = async (cms: CmsService, site: string, from: string): Promise<string | undefined> => {
    const path = from.split('?')[0]!;
    const found = await cms.pageAt(path, site);
    if (found === undefined) return undefined;
    const source = sourceRefOf(found);
    const addresses = await addressesOf(cms, source, publishedCopy);
    if (!addresses.some((address) => address.site === site && address.path === path)) return undefined;
    return documentLabel(await cms.document(source));
};

/**
 * What a document target is called, or its ref once it is gone.
 */
const labelOf = async (cms: CmsService, value: string): Promise<string> => {
    const ref = linkedRef(cms, value);
    if (ref === undefined) return value;
    const state = await cms.document(ref);
    return state.row === undefined ? value : documentLabel(state);
};

/**
 * A redirect as an editor reads it: a document target with its name and the
 * path it is served at on the site now.
 */
const redirectView = async (
    cms: CmsService,
    site: string,
    row: RedirectRow,
    people: readonly Person[]
): Promise<z.output<typeof RedirectSchema>> => ({
    id: row.id,
    from: row.from,
    to:
        row.to.type === 'document'
            ? {
                  type: 'document',
                  ref: row.to.ref,
                  label: await labelOf(cms, row.to.ref),
                  path:
                      (await linkHref(
                          cms,
                          row.to.ref,
                          {
                              site,
                              locale: row.locale ?? undefined,
                          },
                          'published'
                      )) ?? null,
              }
            : row.to,
    status: row.status,
    origin: row.origin,
    by: row.origin === 'import' ? null : viewOf(people, row.createdBy),
    createdAt: row.createdAt.toISOString(),
});

/**
 * A target as it is stored, with a document by its source ref, and the
 * language it is read in: a translation's own, or `from`'s.
 */
const storedTarget = (
    cms: CmsService,
    site: string,
    from: string,
    to: RedirectTarget
): {
    to: RedirectTarget;
    locale: string | null;
} => {
    const problem = targetProblem(to);
    if (problem !== undefined) {
        throw new CmsHttpError(422, {
            detail: problem,
            errors: [],
        });
    }
    if (to.type !== 'document') {
        return {
            to,
            locale: localeOfPath(cms, site, from),
        };
    }
    const parsed = parseRef(to.ref);
    const source = parsed === undefined ? undefined : linkedRef(cms, formatRef(sourceRefOf(parsed)));
    if (parsed === undefined || source === undefined) {
        throw new CmsHttpError(422, {
            detail: `'${to.ref}' names no page or item a redirect can go to. Pass one by ref, like item:articles:k3j9x2.`,
            errors: [],
        });
    }
    return {
        to: {
            type: 'document',
            ref: formatRef(source),
        },
        locale: parsed.locale ?? localeOfPath(cms, site, from),
    };
};

/**
 * Refuses a `from` a request never brings to a redirect, or where a page is
 * published, naming it.
 */
const assertFreeAddress = async (cms: CmsService, site: string, from: string): Promise<void> => {
    const problem = fromProblem(from);
    if (problem !== undefined) {
        throw new CmsHttpError(422, {
            detail: problem,
            errors: [],
        });
    }
    const live = await pageLiveAt(cms, site, from);
    if (live !== undefined) {
        throw new CmsHttpError(409, {
            detail: `${live} is published at ${from}, so a redirect there would hide it. Rename or unpublish ${live} first.`,
        });
    }
};

/**
 * Each redirect that pointed at the saved `from`, pointed where it now goes,
 * or the refusal when the save is refused.
 */
const planned = (stored: readonly RedirectRow[], save: { id?: string; from: string; to: RedirectTarget }) => {
    const plan = planRedirect(stored, save);
    if ('refusal' in plan) {
        throw new CmsHttpError(409, {
            detail: plan.refusal,
        });
    }
    return plan;
};

/**
 * The redirects of a site, which whoever may publish there edits, since a
 * change takes effect at once: the routes behind its Redirects screen and the
 * old addresses a document's Info lists. With several sites they sit under
 * each site, and a single-site CMS has them at `/editing/redirects`.
 */
export const redirectRoutes = (input: { editor: RouteAuth; editingBase: `/${string}`; guarded: Guarded; onSite: boolean }) => {
    const { editor, editingBase, guarded, onSite } = input;
    const base: `/${string}` = onSite ? `${editingBase}/sites/:site/redirects` : `${editingBase}/redirects`;
    const siteParams = onSite
        ? z.object({
              site: z.string(),
          })
        : z.object({});
    const pathParams = onSite
        ? {
              pathParams: siteParams,
          }
        : {};
    const by = (cms: CmsService, args: EditingArgs): string => cms.author(args.auth?.[cms.identity]);

    /**
     * The site the route works on, refused as missing when the editor may
     * not open it.
     */
    const siteOf = (cms: CmsService, args: EditingArgs): string => {
        const site = onSite ? args.params['site']! : DEFAULT_SITE;
        if (onSite && !cms.siteNames().includes(site)) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
        cms.access(args.auth).assertSees(site);
        return site;
    };

    const storedOf = async (cms: CmsService, site: string, id: string): Promise<{ row: RedirectRow; rows: RedirectRow[] }> => {
        const rows = await cms.redirects.list(site);
        const row = rows.find((candidate) => candidate.id === id);
        if (row === undefined) throw new CmsHttpError(404, { detail: `There is no redirect '${id}' on this site.` });
        return {
            row,
            rows,
        };
    };

    const list = route({
        method: 'GET',
        path: base,
        auth: editor,
        summary: onSite ? "List a site's redirects" : 'List the redirects',
        description:
            'Each address that sends visitors elsewhere, by its from, with who made it: a rename on publish, an editor, or an import. With `to`, only the old addresses of one page or item, in every language.',
        tool: true,
        ...pathParams,
        query: z.object({
            to: z.string().optional().describe('Only the redirects to this page or item, by ref, like item:articles:k3j9x2.'),
        }),
        responses: {
            200: {
                body: RedirectListSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const site = siteOf(cms, args);
            const asked = (args.query as { to?: string } | undefined)?.to;
            const parsed = asked === undefined ? undefined : parseRef(asked);
            const to = parsed === undefined ? asked : formatRef(sourceRefOf(parsed));
            const rows = (await cms.redirects.list(site)).filter(
                (row) => to === undefined || (row.to.type === 'document' && row.to.ref === to)
            );
            const people = await peopleOf(cms);
            return {
                status: 200,
                body: {
                    redirects: await Promise.all(rows.map((row) => redirectView(cms, site, row, people))),
                },
            };
        }) as never
    );

    const create = route({
        method: 'POST',
        path: base,
        auth: editor,
        summary: onSite ? 'Redirect an address of a site' : 'Redirect an address',
        description:
            'Sends visitors who ask for `from` to a page or an item, a path on the site, or a URL, from the moment it is made. Prefer a page or an item to its path, since the redirect then follows it through renames. A path that redirects already is stored as where that redirect goes, and the redirects that led to `from` go where it goes. Refused with 409 when a page is published at `from`, when `from` redirects already, or when the redirect would lead back to `from`.',
        tool: true,
        ...pathParams,
        body: CreateRedirectBodySchema,
        responses: {
            201: RedirectSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const site = siteOf(cms, args);
            const body = args.body as z.output<typeof CreateRedirectBodySchema>;
            await assertFreeAddress(cms, site, body.from);
            const target = storedTarget(cms, site, body.from, body.to);
            const plan = planned(await cms.redirects.list(site), {
                from: body.from,
                to: target.to,
            });
            const row = await cms.redirects.saveEdit(
                {
                    site,
                    locale: target.locale,
                    from: body.from,
                    to: plan.to,
                    status: body.status,
                    createdBy: by(cms, args),
                },
                plan.repointed
            );
            return {
                status: 201,
                body: await redirectView(cms, site, row, await peopleOf(cms)),
            };
        }) as never
    );

    const update = route({
        method: 'PATCH',
        path: `${base}/:id`,
        auth: editor,
        summary: 'Change a redirect',
        description:
            'Changes its from, where it goes, or its status, taking effect at once. A redirect a rename made can be deleted but not changed. Refused with 409 as making one is.',
        tool: {
            idempotentHint: true,
        },
        pathParams: siteParams.extend(RedirectParamsSchema.shape),
        body: UpdateRedirectBodySchema,
        responses: {
            200: RedirectSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const site = siteOf(cms, args);
            const body = args.body as z.output<typeof UpdateRedirectBodySchema>;
            const { row, rows } = await storedOf(cms, site, args.params['id']!);
            if (row.origin === 'rename') {
                throw new CmsHttpError(409, {
                    detail: `${row.from} was redirected when its page was renamed, so it follows that page and cannot be changed. Delete it, and make a new one.`,
                });
            }
            const from = body.from ?? row.from;
            if (from !== row.from) await assertFreeAddress(cms, site, from);
            const target =
                body.to === undefined
                    ? {
                          to: row.to,
                          locale: from === row.from ? row.locale : localeOfPath(cms, site, from),
                      }
                    : storedTarget(cms, site, from, body.to);
            const plan = planned(rows, {
                id: row.id,
                from,
                to: target.to,
            });
            const saved = await cms.redirects.saveEdit(
                {
                    id: row.id,
                    site,
                    locale: target.locale,
                    from,
                    to: plan.to,
                    status: body.status ?? row.status,
                    createdBy: row.createdBy,
                },
                plan.repointed
            );
            return {
                status: 200,
                body: await redirectView(cms, site, saved, await peopleOf(cms)),
            };
        }) as never
    );

    const remove = route({
        method: 'DELETE',
        path: `${base}/:id`,
        auth: editor,
        summary: 'Delete a redirect',
        description:
            'Visitors who ask for its from get what the site answers there, which is a page not found until a page takes the address. The person confirms before this runs.',
        tool: {
            needsApproval: true,
        },
        pathParams: siteParams.extend(RedirectParamsSchema.shape),
        responses: {
            204: z.void(),
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const site = siteOf(cms, args);
            const { row } = await storedOf(cms, site, args.params['id']!);
            await cms.redirects.deleteEdit(site, row.id);
            return {
                status: 204,
                body: undefined,
            };
        }) as never
    );

    return {
        list,
        create,
        update,
        delete: remove,
    };
};
