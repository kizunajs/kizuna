import type { ChartBar } from './chart-geometry.js';
import { CONTENT_GROUP } from './navigation.js';

export interface WaitingReview {
    ref: string;
    label: string;
}

export interface StatWidgetBody {
    type: 'stat';
    label: string;
    value: string;
    detail?: string;
}

export interface ChartWidgetBody {
    type: 'chart';
    label: string;
    data: ChartBar[];
}

export interface ReviewsWidgetBody {
    type: 'reviews';
    reviews: WaitingReview[];
}

export interface DashboardCollection {
    kind: 'collection' | 'view';
    name: string;
    label: string;
    group: string | null;
    count: number | null;
}

export interface CollectionsWidgetBody {
    type: 'collections';
    collections: DashboardCollection[];
}

/**
 * One widget as `GET /editing/dashboard` sends it.
 */
export type DashboardWidgetBody = StatWidgetBody | ChartWidgetBody | ReviewsWidgetBody | CollectionsWidgetBody;

/**
 * Widgets that sit together on the dashboard: stats in a row of tiles,
 * charts and reviews side by side, and the collections across the page.
 */
export type WidgetRun =
    | {
          kind: 'stats';
          widgets: StatWidgetBody[];
      }
    | {
          kind: 'panels';
          widgets: (ChartWidgetBody | ReviewsWidgetBody)[];
      }
    | {
          kind: 'collections';
          widget: CollectionsWidgetBody;
      };

/**
 * The widgets in the order listed, with each run of neighbours that share a
 * row put together.
 */
export const runsOf = (widgets: readonly DashboardWidgetBody[]): WidgetRun[] => {
    const runs: WidgetRun[] = [];
    for (const widget of widgets) {
        const previous = runs.at(-1);
        if (widget.type === 'collections') {
            runs.push({
                kind: 'collections',
                widget,
            });
        } else if (widget.type === 'stat') {
            if (previous?.kind === 'stats') previous.widgets.push(widget);
            else {
                runs.push({
                    kind: 'stats',
                    widgets: [widget],
                });
            }
        } else if (previous?.kind === 'panels') previous.widgets.push(widget);
        else {
            runs.push({
                kind: 'panels',
                widgets: [widget],
            });
        }
    }
    return runs;
};

export interface CollectionGroup {
    label: string;
    collections: DashboardCollection[];
}

/**
 * The collections under their `group`, as the sidebar lists them: Content
 * first, then each group in the order a collection first names it.
 */
export const groupsOf = (collections: readonly DashboardCollection[]): CollectionGroup[] => {
    const groups = new Map<string, DashboardCollection[]>([[CONTENT_GROUP, []]]);
    for (const collection of collections) {
        const label = collection.group ?? CONTENT_GROUP;
        groups.set(label, [...(groups.get(label) ?? []), collection]);
    }
    return [...groups]
        .filter(([, members]) => members.length > 0)
        .map(([label, members]) => ({
            label,
            collections: members,
        }));
};
