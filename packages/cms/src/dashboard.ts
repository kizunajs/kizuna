import { z } from 'zod';
import type { Roles } from 'kizunajs';
import type { FieldAuth } from './field.js';
import { undeclaredAccess, type Editor } from './action.js';

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
 * What a stat's `value` and a chart's `data` receive.
 */
export interface DashboardContext {
    editor: Editor;
    /**
     * The plugins' exports, like `plugins.stripe`.
     */
    plugins: Record<string, any>;
    /**
     * The period the editor picked.
     */
    period: DashboardPeriod;
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
export interface StatWidget extends WidgetAccess {
    type: 'stat';
    label: string;
    value: (context: DashboardContext) => StatValue | Promise<StatValue>;
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
export interface ChartWidget extends WidgetAccess {
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
    data: (context: DashboardContext) => readonly ChartBar[] | Promise<readonly ChartBar[]>;
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
 * One widget of the dashboard.
 */
export type DashboardWidget = StatWidget | ChartWidget | ReviewsWidget | CollectionsWidget;

/**
 * What the dashboard shows without `dashboard` on `cms()`.
 */
export const DEFAULT_DASHBOARD: readonly DashboardWidget[] = [
    {
        type: 'reviews',
    },
    {
        type: 'collections',
    },
];

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

const WidgetAuthSchema = z
    .object({
        roles: z.union([z.string(), z.array(z.string())]).optional(),
        requires: z.record(z.string(), z.array(z.string())).optional(),
    })
    .optional();

/**
 * A widget as `cms()` checks it when the config assembles.
 */
export const DashboardWidgetSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('stat'),
        label: z.string().min(1),
        value: z.custom<StatWidget['value']>(isFunction, {
            error: 'must be a function returning what the stat shows',
        }),
        auth: WidgetAuthSchema,
    }),
    z.object({
        type: z.literal('chart'),
        label: z.string().min(1),
        description: z.string().min(1).optional(),
        style: z.enum(['bar', 'line']).optional(),
        data: z.custom<ChartWidget['data']>(isFunction, {
            error: "must be a function returning the chart's points",
        }),
        auth: WidgetAuthSchema,
    }),
    z.object({
        type: z.literal('reviews'),
        auth: WidgetAuthSchema,
    }),
    z.object({
        type: z.literal('collections'),
        auth: WidgetAuthSchema,
    }),
]);

const nameOf = (widget: DashboardWidget): string =>
    widget.type === 'stat' || widget.type === 'chart' ? `Dashboard ${widget.type} '${widget.label}'` : `Dashboard widget '${widget.type}'`;

/**
 * Throws when a widget's `auth` names a role or a permission the editor
 * identity does not declare.
 */
export const assertDashboard = (widgets: readonly DashboardWidget[], roles: Roles | undefined, label: string): void => {
    for (const widget of widgets) {
        const [first] = undeclaredAccess(widget.auth, roles);
        if (first !== undefined) throw new Error(`${nameOf(widget)} ${first}, which ${label} does not declare.`);
    }
};
