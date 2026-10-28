import { z } from 'zod';
import { Kizuna, type RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import type { CmsService } from './cms.js';
import type { Collection } from './definitions.js';
import type { View } from './view-definition.js';
import type { Caller } from './rules.js';
import { accessRefusal, writtenOut } from './action.js';
import { handlerContext, type EditingArgs, type Guarded } from './action-routes.js';
import { waitingReviews } from './reviews.js';
import { WaitingReviewsSchema } from './wire.js';
import { DEFAULT_DASHBOARD, type DashboardContext, type DashboardWidget, type StatValue } from './dashboard.js';

export const StatWidgetSchema = Kizuna.model({
    title: 'CMS.StatWidget',
    schema: z.object({
        type: z.literal('stat'),
        label: z.string(),
        value: z.string().describe('What the stat shows, as your function wrote it.'),
        detail: z.string().optional().describe('A line under the number, like "Up 12% on last week".'),
    }),
});

export const ChartWidgetSchema = Kizuna.model({
    title: 'CMS.ChartWidget',
    schema: z.object({
        type: z.literal('chart'),
        label: z.string(),
        data: z
            .array(
                z.object({
                    label: z.string(),
                    value: z.number(),
                })
            )
            .describe('The bars, oldest first.'),
    }),
});

export const ReviewsWidgetSchema = Kizuna.model({
    title: 'CMS.ReviewsWidget',
    schema: z.object({
        type: z.literal('reviews'),
        reviews: WaitingReviewsSchema.shape.reviews.describe('The reviews waiting on the person signed in.'),
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
                })
            )
            .describe('Every collection and view the person may open.'),
    }),
});

export const DashboardSchema = Kizuna.model({
    title: 'CMS.Dashboard',
    schema: z.object({
        widgets: z
            .array(z.discriminatedUnion('type', [StatWidgetSchema, ChartWidgetSchema, ReviewsWidgetSchema, CollectionsWidgetSchema]))
            .describe('The widgets the person may see, in the order listed.'),
    }),
});

type WidgetBody = z.output<typeof DashboardSchema>['widgets'][number];

const statBody = (label: string, result: StatValue): WidgetBody => {
    const stat =
        typeof result === 'object'
            ? result
            : {
                  value: result,
              };
    return {
        type: 'stat',
        label,
        value: String(stat.value),
        ...(stat.detail === undefined
            ? {}
            : {
                  detail: stat.detail,
              }),
    };
};

interface DashboardRouteInput {
    widgets: readonly DashboardWidget[] | undefined;
    collections: readonly Collection[];
    views: readonly View[];
    editor: RouteAuth;
    editingBase: `/${string}`;
    guarded: Guarded;
}

/**
 * The collections and views a caller may open, each under its group.
 */
const openable = async (cms: CmsService, input: DashboardRouteInput, caller: Caller) => {
    const counts = new Map((await cms.collectionSummaries()).map((summary) => [summary.name, summary.count]));
    return [
        ...input.collections.map((collection) => ({
            kind: 'collection' as const,
            name: collection.name,
            label: collection.label ?? writtenOut(collection.name),
            group: collection.group ?? null,
            count: counts.get(collection.name) ?? 0,
        })),
        ...input.views
            .filter((view) => accessRefusal(view.auth, caller, view.name) === undefined)
            .map((view) => ({
                kind: 'view' as const,
                name: view.name,
                label: view.label ?? writtenOut(view.name),
                group: view.group ?? null,
                count: null,
            })),
    ];
};

/**
 * `GET /editing/dashboard`: the widgets the signed-in editor may see, with
 * each stat and chart function run as them.
 */
export const dashboardRoute = (input: DashboardRouteInput) =>
    route({
        method: 'GET',
        path: `${input.editingBase}/dashboard`,
        auth: input.editor,
        summary: "Read the admin's dashboard: its numbers, the reviews waiting on you, and the collections you may open",
        tool: true,
        responses: {
            200: {
                body: DashboardSchema,
                cache: 'no-store',
            },
        },
    }).handler(
        input.guarded(async (cms, args: EditingArgs) => {
            const caller = cms.caller(args.auth);
            const { editor, plugins } = handlerContext(cms, args);
            const context: DashboardContext = {
                editor,
                plugins,
            };
            const shown = (input.widgets ?? DEFAULT_DASHBOARD).filter(
                (widget) => accessRefusal(widget.auth, caller, 'A widget') === undefined
            );
            const widgets = await Promise.all(
                shown.map(async (widget): Promise<WidgetBody> => {
                    if (widget.type === 'stat') return statBody(widget.label, await widget.value(context));
                    if (widget.type === 'chart') {
                        return {
                            type: 'chart',
                            label: widget.label,
                            data: (await widget.data(context)).map((bar) => ({
                                label: bar.label,
                                value: bar.value,
                            })),
                        };
                    }
                    if (widget.type === 'reviews') {
                        return {
                            type: 'reviews',
                            reviews: await waitingReviews(cms, cms.author(args.auth?.[cms.identity])),
                        };
                    }
                    return {
                        type: 'collections',
                        collections: await openable(cms, input, caller),
                    };
                })
            );
            return {
                status: 200,
                body: {
                    widgets,
                },
            };
        }) as never
    );
