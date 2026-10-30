import { parseRef } from '../refs.js';
import { CONTENT_GROUP } from './navigation.js';
import { relativeTimeOf } from './time.js';

/**
 * The periods the dashboard counts over, in the order the picker lists them,
 * each with the words for the period it is compared with.
 */
export const PERIODS = [
    {
        key: '24h',
        label: 'Last 24 hours',
        before: 'the 24 hours before',
    },
    {
        key: '7d',
        label: 'Last 7 days',
        before: 'the 7 days before',
    },
    {
        key: '30d',
        label: 'Last 30 days',
        before: 'the 30 days before',
    },
    {
        key: '90d',
        label: 'Last 90 days',
        before: 'the 90 days before',
    },
] satisfies ReadonlyArray<{ key: string; label: string; before: string }>;

export type PeriodKey = (typeof PERIODS)[number]['key'];

/**
 * The period the dashboard opens on.
 */
export const DEFAULT_PERIOD: PeriodKey = '7d';

/**
 * The period the address's query names, as in `?period=30d`, or the default
 * for none or one the dashboard does not know.
 */
export const periodOfSearch = (search: string): PeriodKey => {
    const named = new URLSearchParams(search).get('period');
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

/**
 * One bar or point of a dashboard chart, as the dashboard route sends it.
 */
export interface ChartBar {
    label: string;
    value: number;
    /**
     * The same point in the period before, drawn beside it.
     */
    previous?: number;
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

export interface ListRowBody {
    label: string;
    detail?: string;
    value: number;
    /**
     * The value as the row shows it.
     */
    formatted: string;
    /**
     * The most the value can reach, which the bar fills to.
     */
    of?: number;
    change?: number;
    /**
     * The site the row belongs to.
     */
    site?: DashboardSiteName;
}

/**
 * The headings over a list's labels and values.
 */
export interface WidgetColumns {
    label: string;
    value: string;
}

export interface ListWidgetBody {
    type: 'list';
    label: string;
    description?: string;
    columns?: WidgetColumns;
    rows: ListRowBody[];
}

export interface FunnelWidgetBody {
    type: 'funnel';
    label: string;
    description?: string;
    columns?: WidgetColumns;
    steps: Array<{
        label: string;
        value: number;
    }>;
}

/**
 * A site as a dashboard widget names it.
 */
export interface DashboardSiteName {
    key: string;
    label: string;
    icon: string | null;
}

export interface WaitingWidgetBody {
    type: 'waiting';
    count: number;
    /**
     * On the overview, the sites the reviews wait on.
     */
    sites: DashboardSiteName[];
}

export interface ReviewsWidgetBody {
    type: 'reviews';
    reviews: WaitingReview[];
    /**
     * On the overview, every site, which the reviews are grouped by.
     */
    sites?: DashboardSiteName[];
}

export interface DashboardCollection {
    kind: 'collection' | 'view';
    name: string;
    label: string;
    group: string | null;
    count: number | null;
    /**
     * The site a collection of its own belongs to, or `null` for a shared
     * one, on a site's dashboard.
     */
    site?: {
        key: string;
        label: string;
    } | null;
}

export interface CollectionsWidgetBody {
    type: 'collections';
    collections: DashboardCollection[];
}

/**
 * A site's latest refresh after a publish.
 */
export interface RefreshState {
    status: 'answered' | 'failed' | 'retrying';
    at: string;
    attempts: number;
}

/**
 * A value in a site's row, absent on a site the stat leaves out.
 */
export interface SiteStat {
    value?: string;
    detail?: string;
    change?: number;
}

export interface SiteRow extends DashboardSiteName {
    url: string;
    /**
     * The country of the site's first locale, like `NO`.
     */
    country: string | null;
    stats: SiteStat[];
    chart: ChartBar[] | null;
}

export interface SitesWidgetBody {
    type: 'sites';
    chart: {
        label: string;
    } | null;
    stats: Array<{
        label: string;
    }>;
    sites: SiteRow[];
    /**
     * The sites by country, with each column's total, once there are more
     * than six.
     */
    countries: Array<{
        country: string | null;
        sites: string[];
        stats: SiteStat[];
    }> | null;
}

export interface RefreshesWidgetBody {
    type: 'refreshes';
    targets: Array<{
        key: string;
        label: string;
        kind: 'site' | 'partner';
        last: RefreshState | null;
        answered: number;
        total: number;
    }>;
}

export interface ReachWidgetBody {
    type: 'reach';
    sites: number;
    items: Array<{
        ref: string;
        label: string;
        kind: string;
        pages: number;
        sites: number;
        changed: boolean;
    }>;
}

export interface EditorsWidgetBody {
    type: 'editors';
    changes: number;
    published: number;
    editors: Array<{
        id: string;
        name: string;
        image?: string;
        roles: string[];
        sites: Array<{
            label: string;
            roles: string[];
        }>;
        changes: number;
        lastActive: string;
    }>;
}

/**
 * One widget as `GET /editing/dashboard` sends it.
 */
export type DashboardWidgetBody =
    | StatWidgetBody
    | ChartWidgetBody
    | ListWidgetBody
    | FunnelWidgetBody
    | ReviewsWidgetBody
    | WaitingWidgetBody
    | CollectionsWidgetBody
    | SitesWidgetBody
    | RefreshesWidgetBody
    | ReachWidgetBody
    | EditorsWidgetBody;

/**
 * A widget drawn as a panel, two to a row.
 */
export type PanelWidgetBody =
    | ChartWidgetBody
    | ListWidgetBody
    | FunnelWidgetBody
    | ReviewsWidgetBody
    | RefreshesWidgetBody
    | ReachWidgetBody
    | EditorsWidgetBody;

/**
 * Widgets that sit together on the dashboard: stats in a row of tiles,
 * charts and reviews side by side, and the collections across the page.
 */
export type WidgetRun =
    | {
          kind: 'stats';
          widgets: Array<StatWidgetBody | WaitingWidgetBody>;
      }
    | {
          kind: 'panels';
          widgets: PanelWidgetBody[];
      }
    | {
          kind: 'collections';
          widget: CollectionsWidgetBody;
      }
    | {
          kind: 'sites';
          widget: SitesWidgetBody;
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
        } else if (widget.type === 'sites') {
            runs.push({
                kind: 'sites',
                widget,
            });
        } else if (widget.type === 'stat' || widget.type === 'waiting') {
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
 * The collections under the headings the dashboard draws them in: each
 * site's own under its label, then the shared ones under `shared`, leaving
 * out a heading with nothing under it. Without sites, one "Collections".
 */
export const collectionSectionsOf = (
    collections: readonly DashboardCollection[],
    shared: string
): Array<{ heading: string; collections: DashboardCollection[] }> => {
    if (collections.every((collection) => collection.site === undefined)) {
        return collections.length === 0
            ? []
            : [
                  {
                      heading: 'Collections',
                      collections: [...collections],
                  },
              ];
    }
    const sections = new Map<string, DashboardCollection[]>();
    for (const collection of collections) {
        if (collection.site === undefined || collection.site === null) continue;
        sections.set(collection.site.label, [...(sections.get(collection.site.label) ?? []), collection]);
    }
    const common = collections.filter((collection) => collection.site === undefined || collection.site === null);
    if (common.length > 0) sections.set(shared, common);
    return [...sections].map(([heading, members]) => ({
        heading,
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
    widgets.every(
        (widget) =>
            widget.type === 'collections' ||
            (widget.type === 'waiting' && widget.count === 0) ||
            (widget.type === 'reviews' && widget.reviews.length === 0 && widget.sites === undefined)
    );

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

/**
 * The reviews under the site each belongs to: the shared ones first, then
 * each site in order, leaving out a site nothing waits on.
 */
export const reviewGroupsOf = (
    reviews: readonly WaitingReview[],
    sites: readonly DashboardSiteName[]
): Array<{ site: DashboardSiteName | undefined; reviews: WaitingReview[] }> => {
    const siteOf = (ref: string): string | undefined => parseRef(ref)?.site;
    return [
        {
            site: undefined,
            reviews: reviews.filter((review) => siteOf(review.ref) === undefined),
        },
        ...sites.map((site) => ({
            site,
            reviews: reviews.filter((review) => siteOf(review.ref) === site.key),
        })),
    ].filter((group) => group.reviews.length > 0);
};

const capitalized = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * An editor's role as the editors widget names it: "Admin over every site",
 * "Editor on Hagen UK", or their own role.
 */
export const roleOf = (editor: { roles: readonly string[]; sites: ReadonlyArray<{ label: string; roles: readonly string[] }> }): string => {
    if (editor.roles.includes('admin')) return 'Admin over every site';
    if (editor.sites.length > 0) {
        return editor.sites.map((site) => `${site.roles.map(capitalized).join(' and ')} on ${site.label}`).join(', ');
    }
    return editor.roles.map(capitalized).join(' and ');
};

const ORDINALS = new Intl.PluralRules('en-GB', {
    type: 'ordinal',
});

const SUFFIXES: Record<string, string> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
};

/**
 * A refresh as the dashboard says it: "Answered at 09:42", or "Did not
 * answer" with the try it is on.
 */
export const refreshWordsOf = (refresh: RefreshState): { text: string; detail?: string; wrong: boolean } => {
    const clock = CLOCK.format(new Date(refresh.at));
    if (refresh.status === 'answered') {
        return {
            text: `Answered at ${clock}`,
            wrong: false,
        };
    }
    const tried = `${refresh.attempts}${SUFFIXES[ORDINALS.select(refresh.attempts)] ?? 'th'} try at ${clock}`;
    return {
        text: 'Did not answer',
        detail: refresh.status === 'retrying' ? `Retrying, ${tried}` : `Gave up after the ${tried}`,
        wrong: true,
    };
};

const COUNTRY_NAMES = new Intl.DisplayNames(['en'], {
    type: 'region',
});

/**
 * A country's name from its code, like "Norway" for `NO`.
 */
export const countryNameOf = (country: string): string => {
    try {
        return COUNTRY_NAMES.of(country) ?? country;
    } catch {
        return country;
    }
};

/**
 * The rows of the sites table: each site, and once the widget groups them,
 * a row heading each country's sites with its totals. Sites without a
 * country lead, under no heading.
 */
export const siteRowsOf = (
    widget: Pick<SitesWidgetBody, 'sites' | 'countries'>
): Array<{ kind: 'site'; site: SiteRow } | { kind: 'country'; label: string; count: number; stats: SiteStat[] }> => {
    if (widget.countries === null) {
        return widget.sites.map((site) => ({
            kind: 'site',
            site,
        }));
    }
    const ordered = [...widget.countries].sort((first, second) => (first.country === null ? -1 : second.country === null ? 1 : 0));
    return ordered.flatMap((group) => {
        const sites = widget.sites
            .filter((site) => group.sites.includes(site.key))
            .map((site) => ({
                kind: 'site' as const,
                site,
            }));
        if (group.country === null) return sites;
        return [
            {
                kind: 'country' as const,
                label: countryNameOf(group.country),
                count: sites.length,
                stats: group.stats,
            },
            ...sites,
        ];
    });
};

/**
 * Which of the sites table's columns carry a change, which then gets a
 * column of its own after the value.
 */
export const changeColumnsOf = (widget: Pick<SitesWidgetBody, 'sites' | 'stats'>): boolean[] =>
    widget.stats.map((_, index) => widget.sites.some((site) => site.stats[index]?.change !== undefined));

/**
 * How much of its track a list row's bar fills, from 0 to 1: its share of
 * `of` when the row has one, or else of the list's largest value.
 */
export const barShareOf = (row: { value: number; of?: number }, rows: ReadonlyArray<{ value: number }>): number => {
    const whole = row.of ?? Math.max(0, ...rows.map((candidate) => candidate.value));
    if (whole <= 0 || row.value <= 0) return 0;
    return Math.min(1, row.value / whole);
};

const PERCENT = new Intl.NumberFormat('en-GB', {
    style: 'percent',
    maximumFractionDigits: 1,
});

/**
 * A funnel's steps as the dashboard draws them: each one's share of the
 * first, which sizes its bar, and the share of the step before that went on
 * to it, as a percentage. The first step has none.
 */
export const funnelRowsOf = (
    steps: ReadonlyArray<{ label: string; value: number }>
): Array<{ label: string; value: number; share: number; kept: string | undefined }> => {
    const first = steps[0]?.value ?? 0;
    return steps.map((step, index) => {
        const before = index === 0 ? undefined : steps[index - 1]!.value;
        return {
            label: step.label,
            value: step.value,
            share: first <= 0 ? 0 : Math.min(1, Math.max(0, step.value / first)),
            kept: before === undefined || before <= 0 ? undefined : PERCENT.format(step.value / before),
        };
    });
};
