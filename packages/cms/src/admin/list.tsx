import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { usePeople } from '../view/people.js';
import { parseRef } from '../refs.js';
import { humanize } from '../view/schema.js';
import { singularOf } from '../view/array-rows.js';
import { BulkFailures, SelectionActions, useBulkRun } from './bulk-bar.js';
import { bulkSummaryOf, offeredActions, runBulk, type BulkAction, type BulkResult, type BulkTarget } from './bulk.js';
import type { AdminRoute, AdminSite, ListFilter, ListOptions } from './config.js';
import { FilterPanel } from './filter-panel.js';
import {
    DOCUMENT_COLUMNS,
    NEWEST_FIRST,
    PER_PAGE_CHOICES,
    countOf,
    pageOf,
    pagesAround,
    collectionColumnsOf,
    choiceLabelsOf,
    fieldValuesOf,
    orderOf,
    readChosenColumns,
    saveChosenColumns,
    shownColumnsOf,
    sortOfParam,
    sortParamOf,
    sortRows,
    type ListColumn,
    type Sort,
} from './list-columns.js';
import {
    NO_FILTERS,
    STATUS_FIELD,
    activeConditions,
    conditionsOf,
    filterEntriesOf,
    isFiltering,
    meetsFilters,
    type Filters,
} from './list-filters.js';
import { EmptyTable, FlatRows, TreeRows, type TableOptions, type TreeRow } from './list-rows.js';
import { ColumnsPanel, ListToolbar, SortMenu, type ListPanel } from './list-toolbar.js';
import { placeAfterMove, selectionMoves, type PlaceBody, type SelectionMove } from './list-order.js';
import { descendantsIn, pageTreeOf } from './page-tree.js';
import { hrefOf, replaceQuery, useAddress, type CollectionSummary } from './navigation.js';
import { PageHeader, type MetaPair } from './page-header.js';
import { Loading, problemOf } from './parts.js';

/**
 * How many rows a list shows at once until the editor picks another number.
 */
export const PAGE_SIZE = 25;

/**
 * What a list says with nothing in it, and how to add the first.
 */
export interface EmptyWords {
    title: string;
    description: string;
}

/**
 * One move a list asks to save: the row, its item's id, and where it goes.
 */
export interface PlaceMove {
    ref: string;
    id: string;
    title: string;
    body: PlaceBody;
}

/**
 * The editor's own search over the rows, or a search the caller runs, like a
 * view's `list`.
 */
interface OwnSearch {
    query: string;
    onQuery: (query: string) => void;
    placeholder: string;
}

/**
 * A list whose server searches, filters, sorts and pages the rows, so it
 * shows them as they arrive and asks again for another page or order.
 */
export interface ServerList {
    sort: Sort | undefined;
    onSort: (sort: Sort | undefined) => void;
    page: number;
    onPage: (page: number) => void;
    perPage: number;
    onPerPage: (perPage: number) => void;
    /**
     * How many rows the search and filters keep, on every page together.
     */
    matching: number;
    /**
     * Every row the search and filters keep, for Select all.
     */
    selectAll: () => Promise<Array<{ ref: string; title: string }>>;
}

/**
 * Where one page the server sent sits among every row it keeps.
 */
const serverPageOf = <Row,>(
    rows: readonly Row[],
    server: ServerList
): { rows: Row[]; page: number; pageCount: number; first: number; last: number } => {
    const start = server.page * server.perPage;
    return {
        rows: [...rows],
        page: server.page,
        pageCount: Math.max(1, Math.ceil(server.matching / server.perPage)),
        first: rows.length === 0 ? 0 : start + 1,
        last: start + rows.length,
    };
};

/**
 * Every page holds at least this many rows, so a list no longer than this has
 * no page size worth choosing.
 */
const FEWEST_PER_PAGE = Math.min(...PER_PAGE_CHOICES);

/**
 * How far into the rows the page is, the pages to step through when there is
 * more than one, and how many rows a page holds when that could matter.
 */
export function Pager({
    page,
    pageCount,
    first,
    last,
    total,
    perPage,
    onPage,
    onPerPage,
}: {
    page: number;
    pageCount: number;
    first: number;
    last: number;
    total: number;
    perPage: number;
    onPage: (page: number) => void;
    onPerPage: (perPage: number) => void;
}) {
    const choices = PER_PAGE_CHOICES.map((choice) => ({
        value: String(choice),
        label: String(choice),
    }));
    return (
        <div className="k-list-pager">
            <span className="k-list-pager__range">
                {countOf(first)} to {countOf(last)} of {countOf(total)}
            </span>
            {pageCount < 2 ? null : (
                <nav className="k-list-pager__pages" aria-label="Pagination">
                    <Hint label="Previous page">
                        <button
                            type="button"
                            className="k-tab k-list-pager__step"
                            aria-label="Previous page"
                            disabled={page === 0}
                            onClick={() => onPage(page - 1)}>
                            <ChevronLeft {...ICON} />
                        </button>
                    </Hint>
                    {pagesAround(page, pageCount).map((number, index) =>
                        number === null ? (
                            <span key={`gap-${index}`} className="k-list-pager__gap" aria-hidden="true">
                                …
                            </span>
                        ) : (
                            <button
                                key={number}
                                type="button"
                                className="k-tab k-list-pager__page"
                                aria-current={number === page ? 'page' : undefined}
                                onClick={() => onPage(number)}>
                                {number + 1}
                            </button>
                        )
                    )}
                    <Hint label="Next page">
                        <button
                            type="button"
                            className="k-tab k-list-pager__step"
                            aria-label="Next page"
                            disabled={page === pageCount - 1}
                            onClick={() => onPage(page + 1)}>
                            <ChevronRight {...ICON} />
                        </button>
                    </Hint>
                </nav>
            )}
            {total <= FEWEST_PER_PAGE ? null : (
                <Select.Root
                    items={choices}
                    value={String(perPage)}
                    onValueChange={(next) => {
                        if (next !== null) onPerPage(Number(next));
                    }}>
                    <Select.Trigger className="k-tab k-list-pager__per-page" aria-label={`Rows per page, ${perPage}`}>
                        Per page <b>{perPage}</b>
                        <ChevronDown {...ICON} />
                    </Select.Trigger>
                    <Select.Portal>
                        <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="k-positioner">
                            <Select.Popup className="k-popup k-menu">
                                {choices.map((choice) => (
                                    <Select.Item key={choice.value} value={choice.value} className="k-menu__item">
                                        <Select.ItemText>{choice.label}</Select.ItemText>
                                        <Select.ItemIndicator className="k-menu__check">
                                            <Check {...ICON} />
                                        </Select.ItemIndicator>
                                    </Select.Item>
                                ))}
                            </Select.Popup>
                        </Select.Positioner>
                    </Select.Portal>
                </Select.Root>
            )}
        </div>
    );
}

/**
 * The words a count of rows is read in, like "23 articles".
 */
const countText = (count: number, noun: string): string => `${countOf(count)} ${noun}`;

/**
 * A list of rows under the screen's header: a search box with Filters,
 * Columns and Sort, the table with its pager, and with `bulk`, a tick box on
 * every row whose actions take the header's place while any is ticked. With
 * `tree`, and nothing searched, filtered or sorted, the rows nest instead,
 * all at once.
 */
export function ListScreen({
    list,
    title,
    noun,
    rows,
    total,
    problem,
    columns,
    defaultSort,
    defaultSortLabel,
    create,
    empty,
    bulk,
    filters,
    search,
    server,
    drafts: draftCount,
    tree,
    onPlace,
    questionOf,
    above,
    facts = [],
    nameOf = (id) => id,
}: {
    /**
     * What the editor's choice of columns is kept under.
     */
    list: string;
    title: string;
    /**
     * What the rows are, in lowercase, like "articles".
     */
    noun: string;
    rows: readonly TreeRow[] | undefined;
    /**
     * How many the list holds before any filter, when the rows come filtered.
     */
    total?: number | undefined;
    problem: string | undefined;
    columns: readonly ListColumn[];
    defaultSort: Sort | undefined;
    /**
     * The name of the order the rows arrive in, when `defaultSort` is unset.
     */
    defaultSortLabel?: string;
    create?:
        | {
              busy: boolean;
              onCreate: () => void;
          }
        | undefined;
    empty: EmptyWords;
    bulk?:
        | {
              actions: readonly BulkAction[];
              run: (action: BulkAction, targets: BulkTarget[]) => Promise<BulkResult[]>;
          }
        | undefined;
    filters?:
        | {
              definitions: readonly ListFilter[];
              /**
               * Whether the rows have a status to filter by, as items do.
               */
              byStatus?: boolean;
              value: Filters;
              onChange: (filters: Filters) => void;
              connection: Connection;
          }
        | undefined;
    /**
     * A search the caller runs. Without it the list searches its titles and
     * paths itself.
     */
    search?: OwnSearch | undefined;
    /**
     * The server that searches, sorts and pages the rows, when the list holds
     * only the page it shows.
     */
    server?: ServerList | undefined;
    /**
     * How many rows are drafts, when they arrive a page at a time.
     */
    drafts?: number | undefined;
    /**
     * How the rows nest, for a list with a tree, while nothing is searched,
     * filtered or sorted. `folds` off keeps every level open.
     */
    tree?:
        | {
              folds?: boolean;
              orderable?: boolean;
              depth?: number | undefined;
          }
        | undefined;
    /**
     * Saves moves, for a list editors put in order: a row dragged, or the
     * ticked rows moved with Move. Without it the rows have no grips.
     */
    onPlace?: ((moves: PlaceMove[]) => Promise<void>) | undefined;
    /**
     * The question the selection's action asks first, when the list words it
     * itself, like a delete that takes the items under a parent with it.
     */
    questionOf?: ((action: BulkAction, refs: ReadonlySet<string>) => string | undefined) | undefined;
    /**
     * Above the table, like a problem moving a row.
     */
    above?: ReactNode;
    /**
     * More of the header's facts after the total, like "Access Read only".
     */
    facts?: readonly (MetaPair | null)[];
    nameOf?: (id: string) => string;
}) {
    const panelId = useId();
    const panelIds: Record<ListPanel, string> = {
        filters: `${panelId}-filters`,
        columns: `${panelId}-columns`,
    };
    const [ownQuery, setOwnQuery] = useState('');
    const [ownPage, setOwnPage] = useState(0);
    const [ownPerPage, setOwnPerPage] = useState(PAGE_SIZE);
    const [ownSort, setOwnSort] = useState<Sort | undefined>(defaultSort);
    const [panel, setPanel] = useState<ListPanel | undefined>();
    const [chosen, setChosen] = useState<string[] | undefined>(() => readChosenColumns(list));
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    // The titles of rows ticked by Select all, which may sit on other pages.
    const [titles, setTitles] = useState<ReadonlyMap<string, string>>(() => new Map());
    const page = server?.page ?? ownPage;
    const setPage = server?.onPage ?? setOwnPage;
    const perPage = server?.perPage ?? ownPerPage;
    const setPerPage = server?.onPerPage ?? setOwnPerPage;
    const sort = server === undefined ? ownSort : server.sort;
    const setSort = server?.onSort ?? setOwnSort;

    const query = search?.query ?? ownQuery;
    const filterValue = filters?.value ?? NO_FILTERS;
    const filtering = isFiltering(filterValue);

    const searched = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (search !== undefined || term === '') return rows ?? [];
        return (rows ?? []).filter((row) => row.title.toLowerCase().includes(term) || (row.detail ?? '').toLowerCase().includes(term));
    }, [rows, query, search]);
    const sorted = useMemo(
        () => (server === undefined ? sortRows(searched, sort, columns, nameOf) : [...searched]),
        [searched, sort, columns, nameOf, server]
    );
    const nested = tree !== undefined && query.trim() === '' && !filtering && sort === undefined ? tree : undefined;
    // A part of a path with no page of its own only means something in the tree.
    const flat = useMemo(() => (nested === undefined ? sorted.filter((row) => row.segment !== true) : sorted), [nested, sorted]);
    const shownPage = server === undefined ? pageOf(flat, page, perPage) : serverPageOf(flat, server);
    // The rows keep their order only while nothing sorts them, and a tree drags while it nests.
    const ordering = onPlace !== undefined && sort === undefined && (tree === undefined || nested !== undefined) ? onPlace : undefined;
    const idOf = (row: TreeRow): string => row.id ?? row.tree?.id ?? row.ref;
    const moveOf = (row: TreeRow, body: PlaceBody): PlaceMove => ({
        ref: row.ref,
        id: idOf(row),
        title: row.tree?.label ?? row.title,
        body,
    });
    const moveSelected = (move: SelectionMove): void => {
        if (ordering === undefined) return;
        const shown = nested === undefined ? shownPage.rows : sorted;
        const byId = new Map(shown.map((row) => [idOf(row), row]));
        const moves = selectionMoves(
            shown.map((row) => ({
                id: idOf(row),
                parent: row.tree?.parent ?? null,
            })),
            new Set(shown.filter((row) => selected.has(row.ref)).map(idOf)),
            move
        );
        void ordering(moves.map((each) => moveOf(byId.get(each.id)!, each.body)));
    };
    const matching = server?.matching ?? sorted.length;
    const shownColumns = shownColumnsOf(columns, chosen);

    const runOnSelected = async (action: BulkAction) => {
        const shown = new Map((rows ?? []).map((row) => [row.ref, row.tree?.label ?? row.title]));
        const targets = [...selected].map((ref) => ({
            ref,
            title: shown.get(ref) ?? titles.get(ref) ?? ref,
        }));
        const results = (await bulk?.run(action, targets)) ?? [];
        // The rows it did not run on stay ticked, to try again.
        setSelected(new Set(results.filter((result) => result.problem !== undefined).map((result) => result.ref)));
        return bulkSummaryOf(action, results);
    };
    const bulkRun = useBulkRun(runOnSelected);

    // A filter or a search changes which rows the ticks stand for. The page the list opened on stays.
    const searchedFor = useRef({
        filterValue,
        query,
    });
    useEffect(() => {
        if (searchedFor.current.filterValue === filterValue && searchedFor.current.query === query) return;
        searchedFor.current = {
            filterValue,
            query,
        };
        setSelected(new Set());
        setPage(0);
    }, [filterValue, query]);

    const selection =
        bulk === undefined
            ? undefined
            : {
                  selected,
                  onChange: setSelected,
              };
    const options: TableOptions = {
        label: title,
        columns: shownColumns,
        selection,
        sort,
        onSort: setSort,
        nameOf,
    };
    const ticked = selected.size;
    const nothingYet = rows !== undefined && rows.length === 0 && query.trim() === '' && !filtering;
    // Rows arrive filtered, so drafts are counted only while they are all there.
    const drafts = draftCount ?? (filtering ? 0 : (rows ?? []).filter((row) => row.status === 'draft').length);
    const selectAll = async (): Promise<void> => {
        if (server === undefined) {
            setSelected(new Set(sorted.map((row) => row.ref)));
            return;
        }
        const every = await server.selectAll();
        setTitles(new Map(every.map((row) => [row.ref, row.title])));
        setSelected(new Set(every.map((row) => row.ref)));
    };

    const createButton =
        create === undefined ? undefined : (
            <button type="button" className="k-button k-button--primary k-button--small" disabled={create.busy} onClick={create.onCreate}>
                {create.busy ? <LoaderCircle {...ICON} className="k-spin" /> : <Plus {...ICON} />}
                Create new
            </button>
        );

    return (
        <>
            <PageHeader
                crumbs={[]}
                title={title}
                meta={
                    rows === undefined
                        ? undefined
                        : [
                              {
                                  label: 'Total',
                                  value: countText(total ?? rows.length, noun),
                              },
                              drafts === 0
                                  ? null
                                  : {
                                        label: 'Drafts',
                                        value: countOf(drafts),
                                    },
                              ...facts,
                          ]
                }
                actions={
                    bulk !== undefined && ticked > 0 ? (
                        <SelectionActions
                            count={ticked}
                            total={matching}
                            actions={bulk.actions}
                            onMove={ordering === undefined ? undefined : moveSelected}
                            question={
                                questionOf === undefined || bulkRun.confirming === undefined
                                    ? undefined
                                    : questionOf(bulkRun.confirming, selected)
                            }
                            bulk={bulkRun}
                            onSelectAll={() => void selectAll()}
                            onClear={() => setSelected(new Set())}
                        />
                    ) : (
                        createButton
                    )
                }
            />
            <div className="k-admin__body k-list-screen">
                {nothingYet ? null : (
                    <ListToolbar
                        label={title}
                        query={query}
                        placeholder={search?.placeholder ?? 'Search by title or path'}
                        onQuery={(next) => {
                            if (search === undefined) setOwnQuery(next);
                            else search.onQuery(next);
                        }}
                        panel={panel}
                        onPanel={setPanel}
                        panelIds={panelIds}
                        filterCount={activeConditions(filterValue).length}
                        hasFilters={filters !== undefined}
                        sort={
                            <SortMenu
                                columns={shownColumns}
                                sort={sort}
                                defaultLabel={defaultSort === undefined ? defaultSortLabel : undefined}
                                onChange={setSort}
                            />
                        }
                    />
                )}
                {panel === 'filters' && filters !== undefined ? (
                    <FilterPanel
                        id={panelIds.filters}
                        connection={filters.connection}
                        filters={filters.definitions}
                        byStatus={filters.byStatus ?? true}
                        value={filterValue}
                        onChange={filters.onChange}
                    />
                ) : null}
                {panel === 'columns' ? (
                    <ColumnsPanel
                        id={panelIds.columns}
                        columns={columns}
                        shown={new Set(shownColumns.map((column) => column.key))}
                        onChange={(keys) => {
                            setChosen(keys);
                            saveChosenColumns(list, keys);
                        }}
                    />
                ) : null}
                <BulkFailures failed={bulkRun.failed} />
                {above}
                {rows === undefined ? (
                    <Loading problem={problem} />
                ) : (
                    <div className="k-list-results">
                        {sorted.length === 0 ? (
                            <>
                                <EmptyTable
                                    options={{
                                        ...options,
                                        selection: undefined,
                                        onSort: undefined,
                                    }}
                                />
                                <div className="k-list-results__empty">
                                    <h2 className="k-list-results__empty-title">{nothingYet ? empty.title : 'Nothing matches'}</h2>
                                    <p className="k-list-results__empty-text">
                                        {nothingYet ? empty.description : `No ${noun} match the search and filters.`}
                                    </p>
                                    {nothingYet && create !== undefined ? (
                                        <button
                                            type="button"
                                            className="k-button k-button--secondary k-button--small k-list-results__empty-action"
                                            disabled={create.busy}
                                            onClick={create.onCreate}>
                                            <Plus {...ICON} />
                                            Create the first one
                                        </button>
                                    ) : null}
                                    {nothingYet ? null : (
                                        <button
                                            type="button"
                                            className="k-button k-button--secondary k-button--small k-list-results__empty-action"
                                            onClick={() => {
                                                if (search === undefined) setOwnQuery('');
                                                else search.onQuery('');
                                                filters?.onChange(NO_FILTERS);
                                            }}>
                                            Clear search and filters
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : nested !== undefined ? (
                            <TreeRows
                                rows={sorted}
                                options={options}
                                folds={nested.folds ?? true}
                                orderable={nested.orderable === true}
                                depth={nested.depth}
                                onPlace={
                                    ordering === undefined
                                        ? undefined
                                        : (place, body) => {
                                              const row = sorted.find((candidate) => candidate.tree?.id === place.id);
                                              if (row !== undefined) void ordering([moveOf(row, body)]);
                                          }
                                }
                            />
                        ) : (
                            <>
                                <FlatRows
                                    rows={shownPage.rows}
                                    options={options}
                                    onMove={
                                        ordering === undefined
                                            ? undefined
                                            : (from, to) => {
                                                  const body = placeAfterMove(shownPage.rows.map(idOf), from, to);
                                                  if (body !== undefined) void ordering([moveOf(shownPage.rows[from]!, body)]);
                                              }
                                    }
                                />
                                <Pager
                                    page={shownPage.page}
                                    pageCount={shownPage.pageCount}
                                    first={shownPage.first}
                                    last={shownPage.last}
                                    total={matching}
                                    perPage={perPage}
                                    onPage={setPage}
                                    onPerPage={(next) => {
                                        setPerPage(next);
                                        setPage(0);
                                    }}
                                />
                            </>
                        )}
                    </div>
                )}
                {rows !== undefined && problem !== undefined ? (
                    <p className="k-error" role="alert">
                        <CircleAlert {...ICON} />
                        {problem}
                    </p>
                ) : null}
            </div>
        </>
    );
}

interface CollectionPageEntry {
    site: string;
    name: string;
    label: string | null;
    path: string;
    collection: string;
}

interface PageEntry {
    ref: string;
    site: string;
    name: string;
    label: string | null;
    path: string;
    status: string;
    updatedAt: string | null;
    updatedBy: string | null;
}

/**
 * A person's name by their id, once the people have loaded, else the id.
 */
const useNames = (connection: Connection): ((id: string) => string) => {
    const people = usePeople(connection);
    return useMemo(() => {
        const names = new Map((people?.people ?? []).map((person) => [person.id, person.name]));
        return (id: string) => names.get(id) ?? id;
    }, [people]);
};

/**
 * Every page the CMS holds content for, by its path on the site.
 */
/**
 * The key of the pages' Site column, and of the filter by it.
 */
const SITE_COLUMN = 'site';

/**
 * The pages' columns in Overview: the title, then the site, then the rest.
 */
const SITE_COLUMNS: readonly ListColumn[] = [
    DOCUMENT_COLUMNS[0]!,
    {
        key: SITE_COLUMN,
        label: 'Site',
        kind: 'text',
        shown: true,
        sortable: true,
    },
    ...DOCUMENT_COLUMNS.slice(1),
];

const siteFactsOf = (siteFact: ReactNode): MetaPair[] =>
    siteFact === undefined
        ? []
        : [
              {
                  label: 'Site',
                  value: siteFact,
              },
          ];

export function PagesList({
    connection,
    routes,
    site,
    siteFact,
    sites,
}: {
    connection: Connection;
    routes?: Readonly<Record<string, AdminRoute>>;
    /**
     * The site whose pages the list shows, with several.
     */
    site?: string | undefined;
    /**
     * Who the pages belong to, for the header's Site, with several sites.
     */
    siteFact?: ReactNode;
    /**
     * Every site the editor may open, for the pages of Overview, which
     * shows each page's site and filters by it.
     */
    sites?: readonly AdminSite[] | undefined;
}) {
    const [rows, setRows] = useState<TreeRow[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [loads, setLoads] = useState(0);
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const nameOf = useNames(connection);
    // Overview lists every site's pages, each with its site, and filters them by it.
    const everySite = sites !== undefined && sites.length > 0;
    useEffect(() => {
        void connection.call<{ pages: PageEntry[]; collectionPages?: CollectionPageEntry[] }>('editing_pages_list').then((answer) => {
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The pages did not load'));
                return;
            }
            const onSite = (entry: { site: string }): boolean => site === undefined || entry.site === site;
            const pages = answer.body.pages
                .filter((page) => {
                    const ref = parseRef(page.ref);
                    return ref?.type === 'page' && (site === undefined || ref.site === site);
                })
                .map((page) => ({
                    ref: page.ref,
                    href: hrefOf({
                        kind: 'document',
                        ref: page.ref,
                    }),
                    title: page.label ?? humanize(page.name.replace(/Page$/, '')),
                    detail: page.path,
                    status: page.status,
                    updatedAt: page.updatedAt,
                    updatedBy: page.updatedBy ?? undefined,
                    values: {
                        [SITE_COLUMN]: parseRef(page.ref)?.site,
                    },
                }));
            if (everySite) {
                setRows(pages);
                return;
            }
            // A site's own list nests its pages by path, with each route that shows a collection among them.
            const routesShown = (answer.body.collectionPages ?? []).filter(onSite).map((route) => {
                const count = answer.body.pages.filter(
                    (page) => page.name === route.name && page.site === route.site && parseRef(page.ref)?.type === 'item'
                ).length;
                const noun = humanize(route.collection).toLowerCase();
                return {
                    name: route.name,
                    title: route.label ?? humanize(route.name.replace(/Page$/, '')),
                    path: route.path,
                    href: hrefOf({
                        kind: 'collection',
                        name: route.collection,
                    }),
                    count: `${countOf(count)} ${count === 1 ? singularOf(noun) : noun}`,
                };
            });
            setRows(pageTreeOf(pages, routesShown, site ?? ''));
        });
    }, [connection, loads, site, everySite]);
    const actions = offeredActions(routes ?? {}, 'editing_pages');
    const shownRows = useMemo(
        () =>
            !everySite || rows === undefined
                ? rows
                : rows
                      .filter((row) =>
                          meetsFilters(filters, (field) =>
                              field === STATUS_FIELD ? row.status : (row.values?.[field] as string | undefined)
                          )
                      )
                      .map((row) => ({
                          ...row,
                          values: {
                              [SITE_COLUMN]: sites.find((candidate) => candidate.key === row.values?.[SITE_COLUMN])?.label,
                          },
                      })),
        [everySite, rows, filters, sites]
    );
    return (
        <ListScreen
            list="pages"
            title="Pages"
            noun="pages"
            rows={shownRows}
            total={rows?.filter((row) => row.tree === undefined || (row.segment !== true && row.count === undefined)).length}
            facts={siteFactsOf(siteFact)}
            problem={problem}
            columns={everySite ? SITE_COLUMNS : DOCUMENT_COLUMNS}
            filters={
                !everySite
                    ? undefined
                    : {
                          definitions: [
                              {
                                  field: SITE_COLUMN,
                                  label: 'Site',
                                  choices: sites.map((candidate) => ({
                                      value: candidate.key,
                                      label: candidate.label,
                                  })),
                              },
                          ],
                          value: filters,
                          onChange: setFilters,
                          connection,
                      }
            }
            defaultSort={everySite ? NEWEST_FIRST : undefined}
            defaultSortLabel="Path"
            tree={
                everySite
                    ? undefined
                    : {
                          folds: false,
                      }
            }
            nameOf={nameOf}
            empty={{
                title: 'No pages yet',
                description: "Pages come from the site's code. Each one it declares shows here once the site runs.",
            }}
            bulk={
                actions.length === 0
                    ? undefined
                    : {
                          actions,
                          run: async (action, targets) => {
                              const results = await runBulk(action, targets, (tool, input) => connection.call(tool, input));
                              setLoads((count) => count + 1);
                              return results;
                          },
                      }
            }
        />
    );
}

interface ItemEntry {
    id: string;
    ref: string;
    label: string;
    path: string | null;
    status: string;
    updatedAt: string;
    updatedBy: string;
    parent?: string | null;
    treeLabel?: string;
    values?: Record<string, unknown>;
    labels?: Record<string, string>;
}

/**
 * How long the search waits after the last key before it asks the server.
 */
const SEARCH_DELAY = 250;

/**
 * Adds an item to a collection as a draft, and answers with its ref.
 */
export const createItem = async (connection: Connection, name: string): Promise<{ ref: string } | { problem: string }> => {
    const answer = await connection.call<{ ref: string }>('editing_collections_create_item', {
        params: {
            name,
        },
        body: {},
    });
    return answer.status === 201
        ? {
              ref: answer.body.ref,
          }
        : {
              problem: problemOf(answer, 'The item was not added'),
          };
};

/**
 * A collection list's search, filters, sort and page, as its address's query
 * holds them, like `?page=2&sort=-updatedAt&filter=status:is:draft`.
 */
const listAddressOf = (
    search: string,
    defaultSort: Sort | undefined
): { query: string; filter: string[]; sort: Sort | undefined; page: number; perPage: number } => {
    const params = new URLSearchParams(search);
    const sort = params.get('sort');
    const page = Number(params.get('page'));
    const perPage = Number(params.get('limit'));
    return {
        query: params.get('search') ?? '',
        filter: params.getAll('filter'),
        sort: sort === null || sort === '' ? defaultSort : sortOfParam(sort),
        page: Number.isInteger(page) && page > 1 ? page - 1 : 0,
        perPage: PER_PAGE_CHOICES.includes(perPage) ? perPage : PAGE_SIZE,
    };
};

/**
 * One collection's items, newest change first, or nested under their
 * parents for a collection with a `tree`. The list route searches, filters,
 * sorts and pages them, and ticked rows get the selection's actions.
 */
export function CollectionList({
    connection,
    collection,
    options,
    routes,
    onOpen,
    siteFact,
}: {
    connection: Connection;
    collection: CollectionSummary;
    /**
     * The collection's `group`, which the list no longer shows.
     */
    group?: string;
    options: ListOptions | undefined;
    routes: Readonly<Record<string, AdminRoute>>;
    onOpen: (ref: string) => void;
    /**
     * Who the collection belongs to, for the header's Site, with several
     * sites.
     */
    siteFact?: ReactNode;
}) {
    const tree = options?.tree;
    const orderable = options?.orderable === true;
    const defaultSort = tree === undefined && !orderable ? NEWEST_FIRST : undefined;
    const [items, setItems] = useState<{ items: ItemEntry[]; total: number } | undefined>();
    const [counts, setCounts] = useState<{ total: number; drafts: number } | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [creating, setCreating] = useState(false);
    const addressQuery = useAddress().search;
    const listed = useMemo(() => listAddressOf(addressQuery, defaultSort), [addressQuery, defaultSort]);
    const { query, sort, page, perPage } = listed;
    // The address holds only the conditions that filter, so a row still being filled in lives here until it does.
    const [filters, setOwnFilters] = useState<Filters>(() => conditionsOf(listed.filter));
    const addressFilter = JSON.stringify(listed.filter);
    useEffect(() => {
        setOwnFilters((current) =>
            JSON.stringify(filterEntriesOf(current)) === addressFilter ? current : conditionsOf(JSON.parse(addressFilter) as string[])
        );
    }, [addressFilter]);
    const setFilters = (next: Filters): void => {
        setOwnFilters(next);
        replaceQuery({
            filter: filterEntriesOf(next),
        });
    };
    const setQuery = (next: string): void =>
        replaceQuery({
            search: next === '' ? undefined : next,
        });
    const setSort = (next: Sort | undefined): void =>
        replaceQuery({
            sort: sortParamOf(next) === sortParamOf(defaultSort) ? undefined : sortParamOf(next),
        });
    const setPage = (next: number): void =>
        replaceQuery({
            page: next === 0 ? undefined : String(next + 1),
        });
    const setPerPage = (next: number): void =>
        replaceQuery({
            limit: next === PAGE_SIZE ? undefined : String(next),
        });
    const [moveProblem, setMoveProblem] = useState<string | undefined>();
    const [loads, setLoads] = useState(0);
    const nameOf = useNames(connection);
    const name = collection.name;
    const columns = useMemo(() => collectionColumnsOf(options), [options]);
    // The filter follows its key, so a new list of the same conditions asks nothing new.
    const filterKey = JSON.stringify(filterEntriesOf(filters));
    const filter = useMemo(() => JSON.parse(filterKey) as string[], [filterKey]);
    // A tree shows every item at once, nested, until the editor searches, filters or sorts.
    const nested = tree !== undefined && query.trim() === '' && filter.length === 0 && sort === undefined;

    const listQuery = useMemo(
        () => ({
            ...(query.trim() === ''
                ? {}
                : {
                      q: query.trim(),
                  }),
            ...(filter.length === 0
                ? {}
                : {
                      filter,
                  }),
            ...orderOf(sort),
        }),
        [query, filter, sort]
    );
    const fields = useMemo(() => (options?.columns ?? []).map((column) => column.field), [options]);

    useEffect(() => {
        let current = true;
        const ask = async (): Promise<void> => {
            const answer = await connection.call<{ items: ItemEntry[]; total: number }>('editing_collections_list_items', {
                params: {
                    name,
                },
                query: {
                    ...listQuery,
                    ...(fields.length === 0
                        ? {}
                        : {
                              fields,
                          }),
                    ...(nested
                        ? {}
                        : {
                              limit: perPage,
                              offset: page * perPage,
                          }),
                },
            });
            if (!current) return;
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The items did not load'));
                return;
            }
            // A page past the end, after items were deleted, moves back to the last one.
            if (answer.body.items.length === 0 && page > 0 && answer.body.total > 0) {
                setPage(Math.ceil(answer.body.total / perPage) - 1);
                return;
            }
            setProblem(undefined);
            setItems(answer.body);
        };
        const timer = window.setTimeout(() => void ask(), 'q' in listQuery ? SEARCH_DELAY : 0);
        return () => {
            current = false;
            window.clearTimeout(timer);
        };
    }, [connection, name, listQuery, fields, nested, page, perPage, loads]);

    useEffect(() => {
        let current = true;
        const count = (filter: string[]) =>
            connection.call<{ total: number }>('editing_collections_list_items', {
                params: {
                    name,
                },
                query: {
                    ...(filter.length === 0
                        ? {}
                        : {
                              filter,
                          }),
                    limit: 1,
                },
            });
        void Promise.all([count([]), count(['status:is:draft'])]).then(([every, drafted]) => {
            if (!current || every.status !== 200 || drafted.status !== 200) return;
            setCounts({
                total: every.body.total,
                drafts: drafted.body.total,
            });
        });
        return () => {
            current = false;
        };
    }, [connection, name, loads]);

    const rows = useMemo<TreeRow[] | undefined>(() => {
        if (items === undefined) return undefined;
        const ordered =
            nested && !orderable
                ? [...items.items].sort((left, right) => (left.treeLabel ?? left.label).localeCompare(right.treeLabel ?? right.label))
                : items.items;
        return ordered.map((item) => rowOf(item, options));
    }, [items, nested, orderable, options]);

    const create = async (): Promise<void> => {
        setCreating(true);
        const created = await createItem(connection, name);
        setCreating(false);
        if ('problem' in created) {
            setProblem(created.problem);
            return;
        }
        onOpen(created.ref);
    };

    // Each move saves to its item's draft in turn, so the next one reads where the last landed.
    const place = async (moves: PlaceMove[]): Promise<void> => {
        setMoveProblem(undefined);
        const byRef = new Map((items?.items ?? []).map((item) => [item.ref, item]));
        // The rows show where they go at once, and the server's order follows.
        setItems((current) => (current === undefined || moves.length !== 1 ? current : arranged(current, moves[0]!, orderable)));
        for (const move of moves) {
            const answer = await connection.call('editing_collections_place_item', {
                params: {
                    name,
                    id: move.id,
                },
                body: move.body,
            });
            if (answer.status !== 200) {
                setMoveProblem(problemOf(answer, `${byRef.get(move.ref)?.label ?? move.title} was not moved`));
                break;
            }
        }
        setLoads((count) => count + 1);
    };

    const selectAll = async (): Promise<Array<{ ref: string; title: string }>> => {
        const answer = await connection.call<{ items: ItemEntry[] }>('editing_collections_list_items', {
            params: {
                name,
            },
            query: listQuery,
        });
        return answer.status === 200
            ? answer.body.items.map((item) => ({
                  ref: item.ref,
                  title: item.label,
              }))
            : [];
    };

    const actions = offeredActions(routes);
    const noun = collection.label.toLowerCase();

    return (
        <ListScreen
            list={`collections:${name}`}
            title={collection.label}
            noun={noun}
            rows={rows}
            facts={siteFactsOf(siteFact)}
            total={counts?.total ?? items?.total}
            drafts={counts?.drafts ?? 0}
            problem={problem}
            columns={columns}
            defaultSort={defaultSort}
            defaultSortLabel={orderable ? 'Order' : 'Tree order'}
            nameOf={nameOf}
            server={{
                sort,
                onSort: (next) => {
                    setSort(next);
                    setPage(0);
                },
                page,
                onPage: setPage,
                perPage,
                onPerPage: setPerPage,
                matching: items?.total ?? 0,
                selectAll,
            }}
            search={{
                query,
                onQuery: setQuery,
                placeholder: 'Search by title or path',
            }}
            create={
                routes['editing_collections_create_item'] === undefined
                    ? undefined
                    : {
                          busy: creating,
                          onCreate: () => void create(),
                      }
            }
            empty={{
                title: `No ${noun} yet`,
                description: 'Each one starts as a draft, and shows on the site once you publish it.',
            }}
            bulk={
                actions.length === 0
                    ? undefined
                    : {
                          actions,
                          run: async (action, targets) => {
                              // Deleting a parent takes what is under it, so those need no call of their own.
                              const under =
                                  action === 'delete' && tree !== undefined
                                      ? descendantsIn(
                                            rows ?? [],
                                            targets.map((target) => target.ref)
                                        )
                                      : new Set<string>();
                              const results = await runBulk(
                                  action,
                                  targets.filter((target) => !under.has(target.ref)),
                                  (tool, input) => connection.call(tool, input)
                              );
                              setLoads((count) => count + 1);
                              return results;
                          },
                      }
            }
            questionOf={
                tree === undefined ? undefined : (action, refs) => (action === 'delete' ? branchQuestionOf(rows ?? [], refs) : undefined)
            }
            filters={{
                definitions: options?.filters ?? [],
                value: filters,
                onChange: setFilters,
                connection,
            }}
            tree={
                tree === undefined
                    ? undefined
                    : {
                          orderable,
                          depth: options?.treeDepth,
                      }
            }
            onPlace={
                (orderable || tree !== undefined) && routes['editing_collections_place_item'] !== undefined
                    ? (moves) => place(moves)
                    : undefined
            }
            above={
                moveProblem === undefined ? null : (
                    <p className="k-error" role="alert">
                        <CircleAlert {...ICON} />
                        {moveProblem}
                    </p>
                )
            }
        />
    );
}

/**
 * The items as they stand once one move lands, for the list to show before
 * the server answers: a dragged row in its new place, or under its new parent.
 */
const arranged = (
    current: { items: ItemEntry[]; total: number },
    move: PlaceMove,
    orderable: boolean
): { items: ItemEntry[]; total: number } => {
    const from = current.items.findIndex((item) => item.id === move.id);
    if (from === -1) return current;
    const item = {
        ...current.items[from]!,
        ...(move.body.parent !== undefined
            ? {
                  parent: move.body.parent,
              }
            : {}),
    };
    const rest = current.items.filter((_, index) => index !== from);
    const beside = move.body.after ?? move.body.before;
    const neighbour = rest.findIndex((each) => each.id === beside);
    if (neighbour !== -1) item.parent = rest[neighbour]!.parent ?? null;
    if (!orderable) {
        return {
            ...current,
            items: [...rest.slice(0, from), item, ...rest.slice(from)],
        };
    }
    const siblings = rest.filter((each) => (each.parent ?? null) === (item.parent ?? null));
    const at =
        neighbour !== -1
            ? move.body.after !== undefined
                ? neighbour + 1
                : neighbour
            : move.body.at === 'first'
              ? siblings.length === 0
                  ? rest.length
                  : rest.indexOf(siblings[0]!)
              : siblings.length === 0
                ? rest.length
                : rest.indexOf(siblings[siblings.length - 1]!) + 1;
    return {
        ...current,
        items: [...rest.slice(0, at), item, ...rest.slice(at)],
    };
};

/**
 * What Delete asks first when a ticked row has rows under it, which go with
 * it, or `undefined` to ask as any delete does.
 */
const branchQuestionOf = (rows: readonly TreeRow[], refs: ReadonlySet<string>): string | undefined => {
    const under = descendantsIn(rows, [...refs]);
    const going = [...under].filter((ref) => !refs.has(ref));
    if (going.length === 0) return undefined;
    const titleOf = (ref: string): string => {
        const row = rows.find((candidate) => candidate.ref === ref);
        return row?.tree?.label ?? row?.title ?? ref;
    };
    const items = (count: number): string => `${count} ${count === 1 ? 'item' : 'items'}`;
    const ticked = [...refs];
    const named =
        going.length <= 3
            ? `${new Intl.ListFormat('en').format(going.map(titleOf))} go${going.length === 1 ? 'es' : ''} with ${ticked.length === 1 ? 'it' : 'them'}. `
            : '';
    return ticked.length === 1
        ? `Delete ${titleOf(ticked[0]!)} and the ${items(going.length)} under it, with their history? ${named}Pages that show them stop showing them.`
        : `Delete ${items(ticked.length)} and the ${items(going.length)} under them, with their history? ${named}Pages that show them stop showing them.`;
};

/**
 * One item as a row of its collection's list, its field columns showing the
 * labels the server gives.
 */
const rowOf = (item: ItemEntry, options: ListOptions | undefined): TreeRow => ({
    id: item.id,
    ref: item.ref,
    href: hrefOf({
        kind: 'document',
        ref: item.ref,
    }),
    title: item.treeLabel ?? item.label,
    detail: item.path ?? undefined,
    status: item.status,
    updatedAt: item.updatedAt,
    updatedBy: item.updatedBy,
    values: fieldValuesOf(item.values, {
        ...item.labels,
        ...choiceLabelsOf(item.values, options?.columns ?? []),
    }),
    tree:
        options?.tree === undefined
            ? undefined
            : {
                  id: item.id,
                  parent: item.parent ?? null,
                  label: item.label,
              },
});
