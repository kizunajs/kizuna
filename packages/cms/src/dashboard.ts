import { z } from 'zod';
import type { Roles } from 'kizunajs';
import type { FieldAuth } from './field.js';
import { undeclaredAccess, type Editor } from './action.js';
import type { DeclaredSites, SiteEntriesOf, SiteFieldsOf, SiteValues } from './site.js';

/**
 * The periods the editor picks from.
 */
export const DashboardPeriodKeySchema = z.enum(['24h', '7d', '30d', '90d']);

/**
 * One of the periods the editor picks from.
 */
export type DashboardPeriodKey = z.output<typeof DashboardPeriodKeySchema>;

/**
 * The period the dashboard opens on.
 */
export const DEFAULT_PERIOD: DashboardPeriodKey = '7d';

const HOUR = 60 * 60 * 1000;

const LENGTH: Record<DashboardPeriodKey, number> = {
    '24h': 24 * HOUR,
    '7d': 7 * 24 * HOUR,
    '30d': 30 * 24 * HOUR,
    '90d': 90 * 24 * HOUR,
};

/**
 * The period the dashboard counts over, ending now.
 */
export interface DashboardPeriod {
    key: DashboardPeriodKey;
    from: Date;
    to: Date;
    /**
     * The period of the same length just before, ending at `from`.
     */
    previous: {
        from: Date;
        to: Date;
    };
}

/**
 * The period `key` names, ending at `now`.
 */
export const periodOf = (key: DashboardPeriodKey, now: Date): DashboardPeriod => {
    const length = LENGTH[key];
    const from = new Date(now.getTime() - length);
    return {
        key,
        from,
        to: now,
        previous: {
            from: new Date(from.getTime() - length),
            to: new Date(from),
        },
    };
};

/**
 * A declared site as a dashboard function receives it: its name as `key`,
 * beside its fields. `undefined` for a project without sites.
 */
export type DashboardSite<Sites = undefined> = [Sites] extends [undefined]
    ? undefined
    : [Sites] extends [DeclaredSites<any, any>]
      ? SiteFieldsOf<Sites> & {
            key: keyof SiteEntriesOf<Sites> & string;
        }
      :
            | (SiteValues & {
                  key: string;
              })
            | undefined;

/**
 * Sites as the CMS runs the dashboard: declared or not.
 */
export type AnySites = DeclaredSites | undefined;

/**
 * A declared site's name, like `'uk'`.
 */
export type DashboardSiteKey<Sites> = [Sites] extends [DeclaredSites<any, any>] ? keyof SiteEntriesOf<Sites> & string : string;

/**
 * What a stat's `value` and a chart's `data` receive. Pass the sites, as in
 * `DashboardContext<typeof sites>`, to type `site`.
 */
export interface DashboardContext<Sites = undefined> {
    editor: Editor;
    /**
     * The plugins' exports, like `plugins.stripe`.
     */
    plugins: Record<string, any>;
    /**
     * The period the editor picked.
     */
    period: DashboardPeriod;
    /**
     * The site the numbers count for.
     */
    site: DashboardSite<Sites>;
}

/**
 * What a function of the overview receives: every site, in the order
 * declared, in place of one.
 */
export interface OverviewContext<Sites = undefined> {
    editor: Editor;
    /**
     * The plugins' exports, like `plugins.stripe`.
     */
    plugins: Record<string, any>;
    /**
     * The period the editor picked.
     */
    period: DashboardPeriod;
    sites: Array<NonNullable<DashboardSite<Sites>>>;
}

/**
 * What a stat shows: the number, or the number with more about it.
 */
export type StatValue =
    | string
    | number
    | {
          value: string | number;
          /**
           * A line under the number, like "48 orders".
           */
          detail?: string;
          /**
           * How far the number moved since the period before, as a signed
           * fraction: `0.081` shows as ↑ 8.1%.
           */
          change?: number;
          /**
           * Values for a small line beside the number, oldest first.
           */
          trend?: readonly number[];
      };

/**
 * One point of a chart.
 */
export interface ChartBar {
    label: string;
    value: number;
    /**
     * The same point in the period before, drawn behind this one.
     */
    previous?: number;
}

interface WidgetAccess {
    /**
     * Who sees the widget, in a field's words. Its function never runs for
     * anyone else.
     */
    auth?: FieldAuth;
}

interface SiteScope<Sites> {
    /**
     * The sites the widget shows on. Without it, every site.
     */
    sites?: readonly DashboardSiteKey<Sites>[];
}

/**
 * One number, from your function.
 *
 * @example
 * {
 *     type: 'stat',
 *     label: 'Revenue',
 *     value: revenue,
 * }
 */
export interface StatWidget<Sites = undefined> extends WidgetAccess, SiteScope<Sites> {
    type: 'stat';
    label: string;
    value: (context: DashboardContext<Sites>) => StatValue | Promise<StatValue>;
}

/**
 * Bars or a line over time, from your function, oldest first.
 *
 * @example
 * {
 *     type: 'chart',
 *     label: 'Orders per day',
 *     data: ordersPerDay,
 * }
 */
export interface ChartWidget<Sites = undefined> extends WidgetAccess, SiteScope<Sites> {
    type: 'chart';
    label: string;
    /**
     * What the numbers count, in a line under the label, like
     * "Succeeded orders · NOK".
     */
    description?: string;
    /**
     * Bars, the default, or a line through the points.
     */
    style?: 'bar' | 'line';
    data: (context: DashboardContext<Sites>) => readonly ChartBar[] | Promise<readonly ChartBar[]>;
}

/**
 * The reviews waiting on the person signed in.
 */
export interface ReviewsWidget extends WidgetAccess {
    type: 'reviews';
}

/**
 * Every collection and view the person may open, with a count.
 */
export interface CollectionsWidget extends WidgetAccess {
    type: 'collections';
}

/**
 * One widget of the dashboard. With sites, it runs for the site open.
 */
export type DashboardWidget<Sites = undefined> = StatWidget<Sites> | ChartWidget<Sites> | ReviewsWidget | CollectionsWidget;

/**
 * One number across the sites, from your function.
 */
export interface OverviewStatWidget<Sites = undefined> extends WidgetAccess {
    type: 'stat';
    label: string;
    value: (context: OverviewContext<Sites>) => StatValue | Promise<StatValue>;
}

/**
 * Bars or a line across the sites, from your function, oldest first.
 */
export interface OverviewChartWidget<Sites = undefined> extends WidgetAccess {
    type: 'chart';
    label: string;
    description?: string;
    style?: 'bar' | 'line';
    data: (context: OverviewContext<Sites>) => readonly ChartBar[] | Promise<readonly ChartBar[]>;
}

/**
 * The sites side by side: the stats it names, its chart on one scale for
 * every site, the reviews waiting, the last publish and the last refresh.
 * The functions are the site dashboard's own, run once per site.
 *
 * @example
 * {
 *     type: 'sites',
 *     stats: [
 *         {
 *             label: 'Visits',
 *             value: visits,
 *         },
 *     ],
 *     chart: {
 *         label: 'Visits per day',
 *         data: visitsPerDay,
 *     },
 * }
 */
export interface SitesWidget<Sites = undefined> extends WidgetAccess {
    type: 'sites';
    /**
     * The first is drawn large, over the chart.
     */
    stats: ReadonlyArray<
        SiteScope<Sites> & {
            label: string;
            value: (context: DashboardContext<Sites>) => StatValue | Promise<StatValue>;
        }
    >;
    chart?: SiteScope<Sites> & {
        label: string;
        style?: 'bar' | 'line';
        data: (context: DashboardContext<Sites>) => readonly ChartBar[] | Promise<readonly ChartBar[]>;
    };
}

/**
 * Each site's and partner's last refresh after a publish.
 */
export interface RefreshesWidget extends WidgetAccess {
    type: 'refreshes';
}

/**
 * Shared items by how many pages show them, on how many sites.
 */
export interface ReachWidget extends WidgetAccess {
    type: 'reach';
}

/**
 * Each editor's changes this period, with their role.
 */
export interface EditorsWidget extends WidgetAccess {
    type: 'editors';
}

/**
 * One widget of the overview, which an admin over every site opens.
 */
export type OverviewWidget<Sites = undefined> =
    | OverviewStatWidget<Sites>
    | OverviewChartWidget<Sites>
    | SitesWidget<Sites>
    | ReviewsWidget
    | RefreshesWidget
    | ReachWidget
    | EditorsWidget
    | CollectionsWidget;

/**
 * What the dashboard shows without `dashboard` on `cms()`.
 */
export const DEFAULT_DASHBOARD: readonly DashboardWidget<AnySites>[] = [
    {
        type: 'reviews',
    },
    {
        type: 'collections',
    },
];

/**
 * What the overview shows without `overview` on `cms()`.
 */
export const DEFAULT_OVERVIEW: readonly OverviewWidget<AnySites>[] = [
    {
        type: 'reviews',
    },
    {
        type: 'refreshes',
    },
    {
        type: 'reach',
    },
];

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

const WidgetAuthSchema = z
    .object({
        roles: z.union([z.string(), z.array(z.string())]).optional(),
        requires: z.record(z.string(), z.array(z.string())).optional(),
    })
    .optional();

const SiteNamesSchema = z.array(z.string()).optional();

const statSchema = z.object({
    type: z.literal('stat'),
    label: z.string().min(1),
    value: z.custom<StatWidget<AnySites>['value']>(isFunction, {
        error: 'must be a function returning what the stat shows',
    }),
    auth: WidgetAuthSchema,
});

const chartSchema = z.object({
    type: z.literal('chart'),
    label: z.string().min(1),
    description: z.string().min(1).optional(),
    style: z.enum(['bar', 'line']).optional(),
    data: z.custom<ChartWidget<AnySites>['data']>(isFunction, {
        error: "must be a function returning the chart's points",
    }),
    auth: WidgetAuthSchema,
});

const builtIn = <const Type extends string>(type: Type) =>
    z.object({
        type: z.literal(type),
        auth: WidgetAuthSchema,
    });

/**
 * A widget as `cms()` checks it when the config assembles.
 */
export const DashboardWidgetSchema = z.discriminatedUnion('type', [
    statSchema.extend({
        sites: SiteNamesSchema,
    }),
    chartSchema.extend({
        sites: SiteNamesSchema,
    }),
    builtIn('reviews'),
    builtIn('collections'),
]);

/**
 * An overview widget as `cms()` checks it when the config assembles.
 */
export const OverviewWidgetSchema = z.discriminatedUnion('type', [
    statSchema.extend({
        value: z.custom<OverviewStatWidget<AnySites>['value']>(isFunction, {
            error: 'must be a function returning what the stat shows',
        }),
    }),
    chartSchema.extend({
        data: z.custom<OverviewChartWidget<AnySites>['data']>(isFunction, {
            error: "must be a function returning the chart's points",
        }),
    }),
    z.object({
        type: z.literal('sites'),
        stats: z.array(
            z.object({
                label: z.string().min(1),
                value: z.custom<StatWidget<AnySites>['value']>(isFunction, {
                    error: 'must be a function returning what the stat shows',
                }),
                sites: SiteNamesSchema,
            })
        ),
        chart: z
            .object({
                label: z.string().min(1),
                style: z.enum(['bar', 'line']).optional(),
                data: z.custom<ChartWidget<AnySites>['data']>(isFunction, {
                    error: "must be a function returning the chart's points",
                }),
                sites: SiteNamesSchema,
            })
            .optional(),
        auth: WidgetAuthSchema,
    }),
    builtIn('reviews'),
    builtIn('refreshes'),
    builtIn('reach'),
    builtIn('editors'),
    builtIn('collections'),
]);

const nameOf = (widget: { type: string; label?: string }, list: string): string =>
    widget.label === undefined ? `${list} widget '${widget.type}'` : `${list} ${widget.type} '${widget.label}'`;

/**
 * Throws when a widget's `auth` names a role or a permission the editor
 * identity does not declare, or its `sites` a site `cms()` does not.
 */
export const assertDashboard = (
    options: {
        dashboard?: readonly DashboardWidget<AnySites>[];
        overview?: readonly OverviewWidget<AnySites>[];
        sites?: DeclaredSites;
    },
    roles: Roles | undefined,
    label: string
): void => {
    const declared = Object.keys(options.sites?.entries ?? {});
    if (options.overview !== undefined && declared.length === 0) {
        throw new Error('cms() has an `overview`, which compares sites, but declares no sites. List its widgets under `dashboard`.');
    }
    const assertSites = (named: readonly string[] | undefined, owner: string): void => {
        const unknown = (named ?? []).find((site) => !declared.includes(site));
        if (unknown === undefined) return;
        throw new Error(
            declared.length === 0
                ? `${owner} names the site '${unknown}', but cms() declares no sites.`
                : `${owner} names the site '${unknown}', which declareSites() does not declare. It declares ${declared.join(', ')}.`
        );
    };
    const widgets: Array<[DashboardWidget<AnySites> | OverviewWidget<AnySites>, string]> = [
        ...(options.dashboard ?? []).map((widget): [DashboardWidget<AnySites>, string] => [widget, 'Dashboard']),
        ...(options.overview ?? []).map((widget): [OverviewWidget<AnySites>, string] => [widget, 'Overview']),
    ];
    for (const [widget, list] of widgets) {
        const name = nameOf(widget, list);
        const [first] = undeclaredAccess(widget.auth, roles);
        if (first !== undefined) throw new Error(`${name} ${first}, which ${label} does not declare.`);
        if (widget.type === 'sites') {
            for (const stat of widget.stats) assertSites(stat.sites, `${name}'s stat '${stat.label}'`);
            assertSites(widget.chart?.sites, `${name}'s chart`);
        } else if ('sites' in widget) assertSites(widget.sites, name);
    }
};
