import { z } from 'zod';
import type { Roles } from 'kizunajs';
import type { FieldAuth } from './field.js';
import { undeclaredAccess, type Editor } from './action.js';

/**
 * What a stat's `value` and a chart's `data` receive.
 */
export interface DashboardContext {
    editor: Editor;
    /**
     * The plugins' exports, like `plugins.stripe`.
     */
    plugins: Record<string, any>;
}

/**
 * What a stat shows: the number, or the number with a line under it.
 */
export type StatValue =
    | string
    | number
    | {
          value: string | number;
          /**
           * A line under the number, like "Up 12% on last week".
           */
          detail?: string;
      };

/**
 * One bar of a chart.
 */
export interface ChartBar {
    label: string;
    value: number;
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
 *     label: 'Revenue this week',
 *     value: revenueThisWeek,
 * }
 */
export interface StatWidget extends WidgetAccess {
    type: 'stat';
    label: string;
    value: (context: DashboardContext) => StatValue | Promise<StatValue>;
}

/**
 * Bars over time, from your function, oldest first.
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
        data: z.custom<ChartWidget['data']>(isFunction, {
            error: "must be a function returning the chart's bars",
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
