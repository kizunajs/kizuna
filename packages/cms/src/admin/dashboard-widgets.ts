import type { ChartBar } from './chart-geometry.js';
import { CONTENT_GROUP } from './navigation.js';
import { relativeTimeOf } from './time.js';

/**
 * The periods the dashboard counts over, in the order the picker lists them.
 */
export const PERIODS = [
    {
        key: '24h',
        label: 'Last 24 hours',
    },
    {
        key: '7d',
        label: 'Last 7 days',
    },
    {
        key: '30d',
        label: 'Last 30 days',
    },
    {
        key: '90d',
        label: 'Last 90 days',
    },
] satisfies ReadonlyArray<{ key: string; label: string }>;

export type PeriodKey = (typeof PERIODS)[number]['key'];

/**
 * The period the dashboard opens on.
 */
export const DEFAULT_PERIOD: PeriodKey = '7d';

/**
 * The period the address names after `#period=`, or the default for none or
 * one the dashboard does not know.
 */
export const periodOfHash = (hash: string): PeriodKey => {
    const named = /^#?period=([^&]*)/.exec(hash)?.[1];
    return PERIODS.find((period) => period.key === named)?.key ?? DEFAULT_PERIOD;
};

/**
 * The period the numbers count over, as `GET /editing/dashboard` sends it.
 */
export interface DashboardPeriod {
    key: PeriodKey;
    from: string;
    to: string;
    previous: {
        from: string;
        to: string;
    };
}

/**
 * Under two days, a range names the hour as well as the day.
 */
const HOURS_SHOWN = 2 * 24 * 60 * 60 * 1000;

/**
 * A period as the dashboard names it beside the picker, like "21 Oct to
 * 28 Oct": its first and last day, with the time for a period shorter than
 * two days, and the year once it is not this one.
 */
export const rangeOf = (period: { from: string; to: string }, locale?: string, now: Date = new Date()): string => {
    const from = new Date(period.from);
    const to = new Date(period.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return '';
    const format = new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        ...(from.getFullYear() === now.getFullYear() && to.getFullYear() === now.getFullYear()
            ? {}
            : {
                  year: 'numeric',
              }),
        ...(to.getTime() - from.getTime() < HOURS_SHOWN
            ? {
                  hour: '2-digit',
                  minute: '2-digit',
              }
            : {}),
    });
    return `${format.format(from)} to ${format.format(to)}`;
};

export interface WaitingReview {
    ref: string;
    label: string;
    /**
     * Who asked for the review, and when.
     */
    requestedBy?: {
        name: string;
    };
    createdAt?: string;
}

const CLOCK = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
});

/**
 * Who asked for a review and when, as the dashboard's reviews list says it:
 * "Ingrid Haugen asked 2 hours ago", with the time for yesterday.
 */
export const askedOf = (review: WaitingReview, now: Date = new Date()): string | undefined => {
    if (review.requestedBy === undefined || review.createdAt === undefined) return undefined;
    const when = relativeTimeOf(review.createdAt, now);
    if (when === '') return `${review.requestedBy.name} asked`;
    const clock = when === 'yesterday' ? ` at ${CLOCK.format(new Date(review.createdAt))}` : '';
    return `${review.requestedBy.name} asked ${when}${clock}`;
};

export interface StatWidgetBody {
    type: 'stat';
    label: string;
    value: string;
    detail?: string;
    /**
     * How far the number moved since the period before, as a signed
     * fraction: 0.081 is up 8.1%.
     */
    change?: number;
    /**
     * Values for a small line beside the number, oldest first.
     */
    trend?: number[];
}

export interface ChartWidgetBody {
    type: 'chart';
    label: string;
    /**
     * What the numbers count, like "Succeeded orders · NOK".
     */
    description?: string;
    style: 'bar' | 'line';
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

/**
 * A change as the stat tile shows it: an arrow and a percentage with at most
 * one decimal, and no arrow when it rounds to nothing. `spoken` says the same
 * in words for a screen reader.
 */
export const changeOf = (change: number): { text: string; spoken: string; direction: 'up' | 'down' | 'none' } => {
    const percent = Math.round(Math.abs(change) * 1000) / 10;
    if (percent === 0) {
        return {
            text: '0%',
            spoken: 'No change',
            direction: 'none',
        };
    }
    return change > 0
        ? {
              text: `↑ ${percent}%`,
              spoken: `Up ${percent}%`,
              direction: 'up',
          }
        : {
              text: `↓ ${percent}%`,
              spoken: `Down ${percent}%`,
              direction: 'down',
          };
};

/**
 * Whether the dashboard has nothing to count yet: no numbers, no charts and
 * no review waiting. It then welcomes the editor and leaves out the period.
 */
export const isNewOf = (widgets: readonly DashboardWidgetBody[]): boolean =>
    widgets.every((widget) => widget.type === 'collections' || (widget.type === 'reviews' && widget.reviews.length === 0));

/**
 * The most columns the dashboard's grid has.
 */
const MOST_COLUMNS = 4;

/**
 * How many columns the dashboard's grid has for a row of stat tiles: one per
 * tile up to four, so no tile sits alone, and beyond four as few as fill the
 * rows evenly.
 */
export const tileColumnsOf = (tiles: number): number => {
    if (tiles <= 0) return MOST_COLUMNS;
    if (tiles <= MOST_COLUMNS) return tiles;
    return Math.ceil(tiles / Math.ceil(tiles / MOST_COLUMNS));
};
