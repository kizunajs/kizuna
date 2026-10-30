import { z } from 'zod';
import { Kizuna, type RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import type { CmsService } from './cms.js';
import type { Collection } from './definitions.js';
import type { View } from './view-definition.js';
import type { Caller } from './rules.js';
import { CmsHttpError } from './cms.js';
import { accessRefusal, writtenOut } from './action.js';
import { handlerContext, type EditingArgs, type Guarded } from './action-routes.js';
import { waitingReviews } from './reviews.js';
import { WaitingReviewsSchema } from './wire.js';
import { parseRef } from './refs.js';
import { countryOf, siteIconOf } from './admin/route.js';
import { DEFAULT_SITE } from './options.js';
import { editorsOf, reachOf, refreshesSince, refreshSummaries } from './dashboard-data.js';
import type { RefreshRecord } from './storage/store.js';
import {
    DashboardPeriodKeySchema,
    DEFAULT_DASHBOARD,
    DEFAULT_OVERVIEW,
    DEFAULT_PERIOD,
    periodOf,
    type ChartBar,
    type FunnelStep,
    type ListRow,
    type AnySites,
    type DashboardContext,
    type DashboardPeriod,
    type DashboardPeriodKey,
    type DashboardWidget,
    type OverviewContext,
    type OverviewWidget,
    type SitesWidget,
    type StatValue,
} from './dashboard.js';

export const StatWidgetSchema = Kizuna.model({
    title: 'CMS.StatWidget',
    schema: z.object({
        type: z.literal('stat'),
        label: z.string(),
        value: z.string().describe('What the stat shows, as your function wrote it.'),
        detail: z.string().optional().describe('A line under the number, like "48 orders".'),
        change: z.number().optional().describe('How far the number moved since the period before, as a signed fraction: 0.081 is up 8.1%.'),
        trend: z.array(z.number()).optional().describe('Values for a small line beside the number, oldest first.'),
    }),
});

export const ChartWidgetSchema = Kizuna.model({
    title: 'CMS.ChartWidget',
    schema: z.object({
        type: z.literal('chart'),
        label: z.string(),
        description: z.string().optional().describe('What the numbers count, like "Succeeded orders · NOK".'),
        style: z.enum(['bar', 'line']).describe('Bars, or a line through the points.'),
        data: z
            .array(
                z.object({
                    label: z.string(),
                    value: z.number(),
                    previous: z.number().optional().describe('The same point in the period before.'),
                })
            )
            .describe('The points, oldest first.'),
    }),
});

const SiteNameSchema = z.object({
    key: z.string(),
    label: z.string(),
    icon: z.string().nullable().describe("The site's icon as a full URL."),
});

const WidgetColumnsSchema = z
    .object({
        label: z.string(),
        value: z.string(),
    })
    .optional()
    .describe("The headings over the rows' labels and their values.");

export const ListWidgetSchema = Kizuna.model({
    title: 'CMS.ListWidget',
    schema: z.object({
        type: z.literal('list'),
        label: z.string(),
        description: z.string().optional().describe('What the numbers count, like "Views".'),
        columns: WidgetColumnsSchema,
        rows: z
            .array(
                z.object({
                    label: z.string(),
                    detail: z.string().optional().describe('A line under the label.'),
                    value: z.number().describe("The number the row's bar is drawn from."),
                    formatted: z.string().describe('The value as the row shows it.'),
                    of: z.number().optional().describe('The most the value can reach, which the bar fills to.'),
                    change: z.number().optional().describe('How far the value moved since the period before, as a signed fraction.'),
                    site: SiteNameSchema.optional().describe('The site the row belongs to.'),
                })
            )
            .describe('The rows, in the order your function ranked them.'),
    }),
});

export const WaitingWidgetSchema = Kizuna.model({
    title: 'CMS.WaitingWidget',
    schema: z.object({
        type: z.literal('waiting'),
        count: z.int().describe('How many reviews wait.'),
        sites: z.array(SiteNameSchema).describe('On the overview, the sites they wait on.'),
    }),
});

export const FunnelWidgetSchema = Kizuna.model({
    title: 'CMS.FunnelWidget',
    schema: z.object({
        type: z.literal('funnel'),
        label: z.string(),
        description: z.string().optional(),
        columns: WidgetColumnsSchema,
        steps: z
            .array(
                z.object({
                    label: z.string(),
                    value: z.number(),
                })
            )
            .describe('The steps, the first one every visitor takes.'),
    }),
});

export const ReviewsWidgetSchema = Kizuna.model({
    title: 'CMS.ReviewsWidget',
    schema: z.object({
        type: z.literal('reviews'),
        reviews: WaitingReviewsSchema.shape.reviews.describe('The reviews waiting on the person signed in.'),
        sites: z
            .array(SiteNameSchema)
            .optional()
            .describe('On the overview, every site, which the reviews are grouped by after the shared ones.'),
    }),
});

export const CollectionsWidgetSchema = Kizuna.model({
    title: 'CMS.CollectionsWidget',
    schema: z.object({
        type: z.literal('collections'),
        collections: z
            .array(
                z.object({
                    kind: z.enum(['collection', 'view']),
                    name: z.string(),
                    label: z.string(),
                    group: z.string().nullable().describe('The heading it is listed under.'),
                    count: z
                        .int()
                        .nullable()
                        .describe('How many items a collection holds. Null for a view, whose records live in the app.'),
                    site: z
                        .object({
                            key: z.string(),
                            label: z.string(),
                        })
                        .nullable()
                        .optional()
                        .describe('The site a collection of its own belongs to. Null for a shared one.'),
                })
            )
            .describe('Every collection and view the person may open.'),
    }),
});

const StatFieldsSchema = z.object({
    value: z.string().describe('What the stat shows, as your function wrote it.'),
    detail: z.string().optional().describe('A line under the number, like "48 orders".'),
    change: z.number().optional().describe('How far the number moved since the period before, as a signed fraction: 0.081 is up 8.1%.'),
});

const ChartPointsSchema = z
    .array(
        z.object({
            label: z.string(),
            value: z.number(),
            previous: z.number().optional().describe('The same point in the period before.'),
        })
    )
    .describe('The points, oldest first.');

const RefreshStateSchema = z.object({
    status: z.enum(['answered', 'failed', 'retrying']),
    at: z.iso.datetime().describe('When it answered, or was last tried.'),
    attempts: z.int(),
});

const SiteStatSchema = StatFieldsSchema.partial({
    value: true,
});

export const SitesWidgetSchema = Kizuna.model({
    title: 'CMS.SitesWidget',
    schema: z.object({
        type: z.literal('sites'),
        chart: z
            .object({
                label: z.string(),
            })
            .nullable()
            .describe("The small line in each site's row, its label the column's heading."),
        stats: z
            .array(
                z.object({
                    label: z.string(),
                })
            )
            .describe('The columns, in the order listed.'),
        sites: z.array(
            SiteNameSchema.extend({
                url: z.string(),
                country: z.string().nullable().describe("The country of the site's first locale, like NO."),
                stats: z.array(SiteStatSchema).describe('A value for each column, without one on a site the stat leaves out.'),
                chart: ChartPointsSchema.nullable().describe('Null on a site the chart leaves out.'),
            })
        ),
        countries: z
            .array(
                z.object({
                    country: z.string().nullable(),
                    sites: z.array(z.string()).describe("The country's sites, by key."),
                    stats: z.array(SiteStatSchema).describe("Each column's total over the country's sites, where the stat has one."),
                })
            )
            .nullable()
            .describe('The sites by country, once there are more than six. Null until then.'),
    }),
});

export const RefreshesWidgetSchema = Kizuna.model({
    title: 'CMS.RefreshesWidget',
    schema: z.object({
        type: z.literal('refreshes'),
        targets: z
            .array(
                z.object({
                    key: z.string(),
                    label: z.string(),
                    kind: z.enum(['site', 'partner']),
                    last: RefreshStateSchema.nullable(),
                    answered: z.int(),
                    total: z.int(),
                })
            )
            .describe('Each site and partner refreshed this period. Empty until anything is.'),
    }),
});

export const ReachWidgetSchema = Kizuna.model({
    title: 'CMS.ReachWidget',
    schema: z.object({
        type: z.literal('reach'),
        sites: z.int().describe('How many sites there are.'),
        items: z.array(
            z.object({
                ref: z.string(),
                label: z.string(),
                kind: z.string().describe("The collection's label."),
                pages: z.int().describe('How many pages show it.'),
                sites: z.int().describe('On how many sites.'),
                changed: z.boolean().describe('Whether it has changes not yet published.'),
            })
        ),
    }),
});

export const EditorsWidgetSchema = Kizuna.model({
    title: 'CMS.EditorsWidget',
    schema: z.object({
        type: z.literal('editors'),
        changes: z.int().describe('Every change made this period.'),
        published: z.int().describe('How many went live this period.'),
        editors: z.array(
            z.object({
                id: z.string(),
                name: z.string(),
                image: z.string().optional(),
                roles: z.array(z.string()),
                sites: z.array(
                    z.object({
                        label: z.string(),
                        roles: z.array(z.string()),
                    })
                ),
                changes: z.int(),
                lastActive: z.iso.datetime(),
            })
        ),
    }),
});

export const DashboardSchema = Kizuna.model({
    title: 'CMS.Dashboard',
    schema: z.object({
        period: z
            .object({
                key: DashboardPeriodKeySchema,
                from: z.iso.datetime(),
                to: z.iso.datetime(),
                previous: z
                    .object({
                        from: z.iso.datetime(),
                        to: z.iso.datetime(),
                    })
                    .describe('The period of the same length just before.'),
            })
            .describe('The period the numbers count over, ending now.'),
        widgets: z
            .array(
                z.discriminatedUnion('type', [
                    StatWidgetSchema,
                    ChartWidgetSchema,
                    ListWidgetSchema,
                    FunnelWidgetSchema,
                    ReviewsWidgetSchema,
                    WaitingWidgetSchema,
                    CollectionsWidgetSchema,
                    SitesWidgetSchema,
                    RefreshesWidgetSchema,
                    ReachWidgetSchema,
                    EditorsWidgetSchema,
                ])
            )
            .describe('The widgets the person may see, in the order listed.'),
    }),
});

type WidgetBody = z.output<typeof DashboardSchema>['widgets'][number];

/**
 * Whether a number survives JSON. A change divided by a period that sold
 * nothing does not, and is left out rather than sent as null.
 */
const isFiniteNumber = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value);

const statFields = (result: StatValue) => {
    const stat =
        typeof result === 'object'
            ? result
            : {
                  value: result,
              };
    return {
        value: String(stat.value),
        ...(stat.detail === undefined
            ? {}
            : {
                  detail: stat.detail,
              }),
        ...(isFiniteNumber(stat.change)
            ? {
                  change: stat.change,
              }
            : {}),
        ...(stat.trend === undefined
            ? {}
            : {
                  trend: [...stat.trend],
              }),
    };
};

const pointsOf = (points: readonly ChartBar[]) =>
    points.map((point) => ({
        label: point.label,
        value: point.value,
        ...(isFiniteNumber(point.previous)
            ? {
                  previous: point.previous,
              }
            : {}),
    }));

const chartBody = (widget: { label: string; description?: string; style?: 'bar' | 'line' }, points: readonly ChartBar[]): WidgetBody => ({
    type: 'chart',
    label: widget.label,
    ...(widget.description === undefined
        ? {}
        : {
              description: widget.description,
          }),
    style: widget.style ?? 'bar',
    data: pointsOf(points),
});

const WHOLE = new Intl.NumberFormat('en-GB');

type Headed = {
    label: string;
    description?: string;
    columns?: {
        label: string;
        value: string;
    };
};

const headOf = (widget: Headed) => ({
    label: widget.label,
    ...(widget.description === undefined
        ? {}
        : {
              description: widget.description,
          }),
    ...(widget.columns === undefined
        ? {}
        : {
              columns: {
                  label: widget.columns.label,
                  value: widget.columns.value,
              },
          }),
});

const listBody = (cms: CmsService, widget: Headed, rows: readonly ListRow[]): WidgetBody => ({
    type: 'list',
    ...headOf(widget),
    rows: rows.map((row) => ({
        label: row.label,
        ...(row.detail === undefined
            ? {}
            : {
                  detail: row.detail,
              }),
        value: row.value,
        formatted: row.formatted ?? WHOLE.format(row.value),
        ...(isFiniteNumber(row.of) && row.of > 0
            ? {
                  of: row.of,
              }
            : {}),
        ...(isFiniteNumber(row.change)
            ? {
                  change: row.change,
              }
            : {}),
        ...(row.site === undefined || cms.options.sites?.values[row.site] === undefined
            ? {}
            : {
                  site: siteNameOf(cms, row.site),
              }),
    })),
});

const funnelBody = (widget: Headed, steps: readonly FunnelStep[]): WidgetBody => ({
    type: 'funnel',
    ...headOf(widget),
    steps: steps.map((step) => ({
        label: step.label,
        value: step.value,
    })),
});

const refreshState = (record: RefreshRecord) => ({
    status: record.status,
    at: record.at.toISOString(),
    attempts: record.attempts,
});

interface DashboardRouteInput {
    widgets: readonly DashboardWidget<AnySites>[] | undefined;
    collections: readonly Collection[];
    views: readonly View[];
    editor: RouteAuth;
    editingBase: `/${string}`;
    guarded: Guarded;
}

const isAdmin = (caller: Caller): boolean =>
    caller.role === undefined ? false : typeof caller.role === 'string' ? caller.role === 'admin' : caller.role.includes('admin');

const shownOn = (widget: { sites?: readonly string[] }, site: string): boolean => widget.sites === undefined || widget.sites.includes(site);

/**
 * The collections and views a caller may open, each under its group, after
 * the site's own collections on a site's dashboard.
 */
const openable = async (cms: CmsService, input: DashboardRouteInput, caller: Caller, site: string | undefined) => {
    const counts = new Map((await cms.collectionSummaries(DEFAULT_SITE, site)).map((summary) => [summary.name, summary.count]));
    const own = site === undefined ? [] : (cms.options.sites?.entries[site]?.collections ?? []);
    const ownCounts = new Map(
        site === undefined || own.length === 0 ? [] : (await cms.collectionSummaries(site)).map((summary) => [summary.name, summary.count])
    );
    const siteLabel = site === undefined ? undefined : cms.options.sites?.values[site]?.label;
    // With sites, every collection says whose it is, so the shared ones show once, under Shared.
    const shared =
        cms.siteNames().length === 0
            ? {}
            : {
                  site: null,
              };
    return [
        ...own.map((collection) => ({
            kind: 'collection' as const,
            name: collection.name,
            label: collection.label ?? writtenOut(collection.name),
            group: collection.group ?? null,
            count: ownCounts.get(collection.name) ?? 0,
            site: {
                key: site!,
                label: siteLabel ?? site!,
            },
        })),
        ...input.collections.map((collection) => ({
            kind: 'collection' as const,
            name: collection.name,
            label: collection.label ?? writtenOut(collection.name),
            group: collection.group ?? null,
            count: counts.get(collection.name) ?? 0,
            ...shared,
        })),
        ...input.views
            .filter((view) => accessRefusal(view.auth, caller, view.name) === undefined)
            .map((view) => ({
                kind: 'view' as const,
                name: view.name,
                label: view.label ?? writtenOut(view.name),
                group: view.group ?? null,
                count: null,
                ...shared,
            })),
    ];
};

const siteNameOf = (cms: CmsService, key: string) => {
    const values = cms.options.sites!.values[key]!;
    return {
        key,
        label: values.label,
        icon: siteIconOf(values.icon, values.url),
    };
};

/**
 * More sites than this, and the `sites` widget groups them by country.
 */
const GROUPED_PAST = 6;

const siteStatOf = (result: StatValue) => {
    const { trend: _, ...fields } = statFields(result);
    return fields;
};

/**
 * The `sites` widget: a row per site from the site dashboard's own
 * functions, and past six sites each country's totals.
 */
const sitesBody = async (
    cms: CmsService,
    widget: SitesWidget<AnySites>,
    sites: readonly string[],
    contextOf: (site: string) => DashboardContext<AnySites>,
    overviewOf: (sites: readonly string[]) => OverviewContext<AnySites>
): Promise<WidgetBody> => {
    const rows = await Promise.all(
        sites.map(async (site) => {
            const context = contextOf(site);
            const values = cms.options.sites!.values[site]!;
            return {
                ...siteNameOf(cms, site),
                url: values.url,
                country: countryOf(values.locales?.[0]),
                stats: await Promise.all(
                    widget.stats.map(async (stat) => (shownOn(stat, site) ? siteStatOf(await stat.value(context)) : {}))
                ),
                chart: widget.chart === undefined || !shownOn(widget.chart, site) ? null : pointsOf(await widget.chart.data(context)),
            };
        })
    );
    const byCountry = new Map<string | null, string[]>();
    for (const row of rows) byCountry.set(row.country, [...(byCountry.get(row.country) ?? []), row.key]);
    const countries =
        sites.length <= GROUPED_PAST
            ? null
            : await Promise.all(
                  [...byCountry].map(async ([country, keys]) => ({
                      country,
                      sites: keys,
                      stats: await Promise.all(
                          widget.stats.map(async (stat) => (stat.total === undefined ? {} : siteStatOf(await stat.total(overviewOf(keys)))))
                      ),
                  }))
              );
    return {
        type: 'sites',
        chart:
            widget.chart === undefined
                ? null
                : {
                      label: widget.chart.label,
                  },
        stats: widget.stats.map((stat) => ({
            label: stat.label,
        })),
        sites: rows,
        countries,
    };
};

const refreshesBody = (cms: CmsService, refreshes: readonly RefreshRecord[]): WidgetBody => {
    const summaries = refreshSummaries(refreshes);
    const declared = cms.siteNames();
    const targets = [...declared.filter((site) => summaries.has(site)), ...[...summaries.keys()].filter((key) => !declared.includes(key))];
    return {
        type: 'refreshes',
        targets: targets.map((key) => {
            const summary = summaries.get(key)!;
            return {
                key,
                label: cms.options.sites?.values[key]?.label ?? writtenOut(key),
                kind: declared.includes(key) ? ('site' as const) : ('partner' as const),
                last: refreshState(summary.last),
                answered: summary.answered,
                total: summary.total,
            };
        }),
    };
};

/**
 * `GET /editing/dashboard`: the widgets the signed-in editor may see, with
 * each stat and chart function run as them. With sites, `site` names the site
 * the numbers count for, and without one an admin over every site gets the
 * overview.
 */
export const dashboardRoute = (input: DashboardRouteInput) =>
    route({
        method: 'GET',
        path: `${input.editingBase}/dashboard`,
        auth: input.editor,
        summary: "Read the admin's dashboard: its numbers, the reviews waiting on you, and the collections you may open",
        tool: true,
        query: z.object({
            period: DashboardPeriodKeySchema.default(DEFAULT_PERIOD).describe(
                'The period the numbers count over, ending now: the last 24 hours, 7, 30 or 90 days.'
            ),
            site: z
                .string()
                .optional()
                .describe('The site the numbers count for. Without one, an admin over every site gets the sites compared.'),
        }),
        responses: {
            200: {
                body: DashboardSchema,
                cache: 'no-store',
            },
        },
    }).handler(
        input.guarded(async (cms, args: EditingArgs) => {
            const access = cms.access(args.auth);
            const declared = cms.siteNames();
            const site = args.query?.['site'] as string | undefined;
            if (site !== undefined && !declared.includes(site)) {
                throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
            }
            access.assertSees(site);
            const caller = site === undefined ? access.shared : access.callerOn(site);
            const { editor, plugins } = handlerContext(cms, args);
            const period: DashboardPeriod = periodOf(
                (args.query?.['period'] as DashboardPeriodKey | undefined) ?? DEFAULT_PERIOD,
                new Date()
            );
            const shown = <Widget extends { auth?: DashboardWidget['auth'] }>(widgets: readonly Widget[]): Widget[] =>
                widgets.filter((widget) => accessRefusal(widget.auth, caller, 'A widget') === undefined);
            const contextOf = (named: string | undefined): DashboardContext<AnySites> => ({
                editor,
                plugins,
                period,
                site: named === undefined ? undefined : (cms.siteInfo(named) as NonNullable<DashboardContext<AnySites>['site']>),
            });
            const author = cms.author(args.auth?.[cms.identity]);
            const sees = (ref: string): boolean => access.seesRef(ref);
            const onShown = (ref: string): boolean => {
                if (declared.length === 0) return true;
                const parsed = parseRef(ref);
                return (parsed?.site ?? DEFAULT_SITE) === (site ?? DEFAULT_SITE);
            };
            const reviewsBody = async (): Promise<WidgetBody> => ({
                type: 'reviews',
                reviews: await waitingReviews(cms, author, (ref) => sees(ref) && onShown(ref)),
            });
            const collectionsBody = async (): Promise<WidgetBody> => ({
                type: 'collections',
                collections: await openable(cms, input, caller, site),
            });

            const overview = site === undefined && declared.length > 0 && isAdmin(access.shared);
            let widgets: WidgetBody[];
            if (overview) {
                const listed = shown((cms.options.overview ?? DEFAULT_OVERVIEW) as readonly OverviewWidget<AnySites>[]);
                const sites = declared.filter((name) => access.sees(name));
                const overviewContext: OverviewContext<AnySites> = {
                    editor,
                    plugins,
                    period,
                    sites: sites.map((name) => cms.siteInfo(name) as OverviewContext<AnySites>['sites'][number]),
                };
                const overviewOf = (keys: readonly string[]): OverviewContext<AnySites> => ({
                    ...overviewContext,
                    sites: keys.map((name) => cms.siteInfo(name) as OverviewContext<AnySites>['sites'][number]),
                });
                const needsReviews = listed.some((widget) => widget.type === 'reviews' || widget.type === 'waiting');
                const waiting = needsReviews ? await waitingReviews(cms, undefined, sees) : [];
                const needsRefreshes = listed.some((widget) => widget.type === 'refreshes');
                const refreshes = needsRefreshes ? await refreshesSince(cms, period.from) : [];
                widgets = await Promise.all(
                    listed.map(async (widget): Promise<WidgetBody> => {
                        if (widget.type === 'stat') {
                            return {
                                type: 'stat',
                                label: widget.label,
                                ...statFields(await widget.value(overviewContext)),
                            };
                        }
                        if (widget.type === 'chart') return chartBody(widget, await widget.data(overviewContext));
                        if (widget.type === 'list') return listBody(cms, widget, await widget.data(overviewContext));
                        if (widget.type === 'funnel') return funnelBody(widget, await widget.data(overviewContext));
                        if (widget.type === 'sites') {
                            return sitesBody(cms, widget, sites, contextOf, overviewOf);
                        }
                        if (widget.type === 'reviews') {
                            return {
                                type: 'reviews',
                                reviews: waiting,
                                sites: sites.map((name) => siteNameOf(cms, name)),
                            };
                        }
                        if (widget.type === 'waiting') {
                            const waitedOn = new Set(waiting.map((review) => parseRef(review.ref)?.site));
                            return {
                                type: 'waiting',
                                count: waiting.length,
                                sites: sites.filter((name) => waitedOn.has(name)).map((name) => siteNameOf(cms, name)),
                            };
                        }
                        if (widget.type === 'refreshes') return refreshesBody(cms, refreshes);
                        if (widget.type === 'reach') {
                            return {
                                type: 'reach',
                                sites: declared.length,
                                items: await reachOf(cms),
                            };
                        }
                        if (widget.type === 'editors') {
                            return {
                                type: 'editors',
                                ...(await editorsOf(cms, period)),
                            };
                        }
                        if (widget.type === 'collections') return collectionsBody();
                        throw new Error(`The overview cannot draw a widget of type '${(widget as { type: string }).type}'.`);
                    })
                );
            } else {
                // With sites, a widget of numbers counts for one site, so the shared content's dashboard has none.
                const listed = shown(input.widgets ?? DEFAULT_DASHBOARD).filter((widget) =>
                    widget.type === 'reviews' || widget.type === 'collections'
                        ? true
                        : declared.length === 0 || (site !== undefined && shownOn(widget, site))
                );
                const context = contextOf(site);
                widgets = await Promise.all(
                    listed.map(async (widget): Promise<WidgetBody> => {
                        if (widget.type === 'stat') {
                            return {
                                type: 'stat',
                                label: widget.label,
                                ...statFields(await widget.value(context)),
                            };
                        }
                        if (widget.type === 'chart') return chartBody(widget, await widget.data(context));
                        if (widget.type === 'list') return listBody(cms, widget, await widget.data(context));
                        if (widget.type === 'funnel') return funnelBody(widget, await widget.data(context));
                        if (widget.type === 'reviews') return reviewsBody();
                        if (widget.type === 'waiting') {
                            return {
                                type: 'waiting',
                                count: (await waitingReviews(cms, author, (ref) => sees(ref) && onShown(ref))).length,
                                sites: [],
                            };
                        }
                        if (widget.type === 'collections') return collectionsBody();
                        throw new Error(`The dashboard cannot draw a widget of type '${(widget as { type: string }).type}'.`);
                    })
                );
            }
            return {
                status: 200,
                body: {
                    period: {
                        key: period.key,
                        from: period.from.toISOString(),
                        to: period.to.toISOString(),
                        previous: {
                            from: period.previous.from.toISOString(),
                            to: period.previous.to.toISOString(),
                        },
                    },
                    widgets,
                },
            };
        }) as never
    );
