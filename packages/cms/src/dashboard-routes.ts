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
import { siteIconOf } from './admin/route.js';
import { DEFAULT_SITE } from './options.js';
import { editorsOf, lastPublishes, reachOf, refreshesSince, refreshSummaries, type RefreshRecord } from './dashboard-data.js';
import {
    DashboardPeriodKeySchema,
    DEFAULT_DASHBOARD,
    DEFAULT_OVERVIEW,
    DEFAULT_PERIOD,
    periodOf,
    type ChartBar,
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

export const SitesWidgetSchema = Kizuna.model({
    title: 'CMS.SitesWidget',
    schema: z.object({
        type: z.literal('sites'),
        chart: z
            .object({
                label: z.string(),
                style: z.enum(['bar', 'line']),
            })
            .nullable()
            .describe("The chart each site draws, on one scale for every site's."),
        sites: z.array(
            SiteNameSchema.extend({
                url: z.string(),
                stats: z
                    .array(
                        StatFieldsSchema.partial({
                            value: true,
                        }).extend({
                            label: z.string(),
                        })
                    )
                    .describe('The stats named, without a value on a site the stat leaves out.'),
                chart: ChartPointsSchema.nullable().describe('Null on a site the chart leaves out.'),
                waiting: z.int().describe('How many reviews wait on the site.'),
                lastPublish: z
                    .object({
                        ref: z.string(),
                        label: z.string(),
                        by: z.string().nullable(),
                        at: z.iso.datetime(),
                    })
                    .nullable(),
                lastRefresh: RefreshStateSchema.nullable(),
            })
        ),
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
                    ReviewsWidgetSchema,
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
    const counts = new Map((await cms.collectionSummaries()).map((summary) => [summary.name, summary.count]));
    const own = site === undefined ? [] : (cms.options.sites?.entries[site]?.collections ?? []);
    const ownCounts = new Map(
        site === undefined || own.length === 0 ? [] : (await cms.collectionSummaries(site)).map((summary) => [summary.name, summary.count])
    );
    const siteLabel = site === undefined ? undefined : cms.options.sites?.values[site]?.label;
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
            ...(own.length === 0
                ? {}
                : {
                      site: null,
                  }),
        })),
        ...input.views
            .filter((view) => accessRefusal(view.auth, caller, view.name) === undefined)
            .map((view) => ({
                kind: 'view' as const,
                name: view.name,
                label: view.label ?? writtenOut(view.name),
                group: view.group ?? null,
                count: null,
                ...(own.length === 0
                    ? {}
                    : {
                          site: null,
                      }),
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
 * The `sites` widget: each site's stats and chart from the site dashboard's
 * own functions, beside what the CMS records of it.
 */
const sitesBody = async (
    cms: CmsService,
    widget: SitesWidget<AnySites>,
    sites: readonly string[],
    contextOf: (site: string) => DashboardContext<AnySites>,
    reviewRefs: readonly string[],
    refreshes: readonly RefreshRecord[]
): Promise<WidgetBody> => {
    const published = await lastPublishes(cms, sites);
    const refreshed = refreshSummaries(refreshes);
    const columns = await Promise.all(
        sites.map(async (site) => {
            const context = contextOf(site);
            const values = cms.options.sites!.values[site]!;
            const chart = widget.chart;
            const last = refreshed.get(site)?.last;
            return {
                ...siteNameOf(cms, site),
                url: values.url,
                stats: await Promise.all(
                    widget.stats.map(async (stat) => {
                        if (!shownOn(stat, site)) {
                            return {
                                label: stat.label,
                            };
                        }
                        const { trend: _, ...fields } = statFields(await stat.value(context));
                        return {
                            label: stat.label,
                            ...fields,
                        };
                    })
                ),
                chart: chart === undefined || !shownOn(chart, site) ? null : pointsOf(await chart.data(context)),
                waiting: reviewRefs.filter((ref) => parseRef(ref)?.site === site).length,
                lastPublish: published.get(site) ?? null,
                lastRefresh: last === undefined ? null : refreshState(last),
            };
        })
    );
    return {
        type: 'sites',
        chart:
            widget.chart === undefined
                ? null
                : {
                      label: widget.chart.label,
                      style: widget.chart.style ?? 'bar',
                  },
        sites: columns,
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
                const needsReviews = listed.some((widget) => widget.type === 'reviews' || widget.type === 'sites');
                const waiting = needsReviews ? await waitingReviews(cms, undefined, sees) : [];
                const needsRefreshes = listed.some((widget) => widget.type === 'refreshes' || widget.type === 'sites');
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
                        if (widget.type === 'sites') {
                            return sitesBody(
                                cms,
                                widget,
                                sites,
                                contextOf,
                                waiting.map((review) => review.ref),
                                refreshes
                            );
                        }
                        if (widget.type === 'reviews') {
                            return {
                                type: 'reviews',
                                reviews: waiting,
                                sites: sites.map((name) => siteNameOf(cms, name)),
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
                        return collectionsBody();
                    })
                );
            } else {
                // With sites, a stat or a chart counts for one site, so the shared content's dashboard has none.
                const listed = shown(input.widgets ?? DEFAULT_DASHBOARD).filter((widget) =>
                    widget.type === 'stat' || widget.type === 'chart'
                        ? declared.length === 0 || (site !== undefined && shownOn(widget, site))
                        : true
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
                        if (widget.type === 'reviews') return reviewsBody();
                        return collectionsBody();
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
