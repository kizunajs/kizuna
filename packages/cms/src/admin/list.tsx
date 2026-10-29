import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, LoaderCircle, Plus } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Hint } from '../view/hint.js';
import { usePeople } from '../view/people.js';
import { humanize } from '../view/schema.js';
import { BulkFailures, SelectionActions, useBulkRun } from './bulk-bar.js';
import { bulkSummaryOf, offeredActions, runBulk, type BulkAction, type BulkResult, type BulkTarget } from './bulk.js';
import type { AdminRoute, ListFilter, ListOptions } from './config.js';
import { FilterPanel } from './filter-panel.js';
import {
    DOCUMENT_COLUMNS,
    NEWEST_FIRST,
    PER_PAGE_CHOICES,
    countOf,
    pageOf,
    pagesAround,
    readChosenColumns,
    saveChosenColumns,
    shownColumnsOf,
    sortRows,
    type ListColumn,
    type Sort,
} from './list-columns.js';
import { NO_FILTERS, activeConditions, filterItems, isFiltering, itemQueriesOf, queryKeyOf, type Filters } from './list-filters.js';
import { EmptyTable, FlatRows, TreeRows, type TableOptions, type TreeRow } from './list-rows.js';
import { ColumnsPanel, ListToolbar, SortMenu, type ListPanel } from './list-toolbar.js';
import { parentAfterDrop, parentChange, type TreePlace } from './list-tree.js';
import { hrefOf, type CollectionSummary } from './navigation.js';
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
 * The editor's own search over the rows, or a search the caller runs, like a
 * view's `list`.
 */
interface OwnSearch {
    query: string;
    onQuery: (query: string) => void;
    placeholder: string;
}

/**
 * Every page holds at least this many rows, so a list no longer than this has
 * no page size worth choosing.
 */
const FEWEST_PER_PAGE = Math.min(...PER_PAGE_CHOICES);

/**
 * How far into the rows the page is, the pages to step through when there is
 * more than one, and how many rows a page holds when that could matter.
 */
function Pager({
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
    tree,
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
    tree?:
        | {
              onMove: (dragged: TreePlace, target: TreePlace | null) => void;
          }
        | undefined;
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
    const [page, setPage] = useState(0);
    const [perPage, setPerPage] = useState(PAGE_SIZE);
    const [sort, setSort] = useState<Sort | undefined>(defaultSort);
    const [panel, setPanel] = useState<ListPanel | undefined>();
    const [chosen, setChosen] = useState<string[] | undefined>(() => readChosenColumns(list));
    const [selected, setSelected] = useState<Set<string>>(() => new Set());

    const query = search?.query ?? ownQuery;
    const filterValue = filters?.value ?? NO_FILTERS;
    const filtering = isFiltering(filterValue);

    const searched = useMemo(() => {
        const term = query.trim().toLowerCase();
        if (search !== undefined || term === '') return rows ?? [];
        return (rows ?? []).filter((row) => row.title.toLowerCase().includes(term) || (row.detail ?? '').toLowerCase().includes(term));
    }, [rows, query, search]);
    const sorted = useMemo(() => sortRows(searched, sort, columns, nameOf), [searched, sort, columns, nameOf]);
    const nested = tree !== undefined && query.trim() === '' && !filtering && sort === undefined ? tree : undefined;
    const shownPage = pageOf(sorted, page, perPage);
    const shownColumns = shownColumnsOf(columns, chosen);

    const runOnSelected = async (action: BulkAction) => {
        const targets = (rows ?? [])
            .filter((row) => selected.has(row.ref))
            .map((row) => ({
                ref: row.ref,
                title: row.tree?.label ?? row.title,
            }));
        const results = (await bulk?.run(action, targets)) ?? [];
        // The rows it did not run on stay ticked, to try again.
        setSelected(new Set(results.filter((result) => result.problem !== undefined).map((result) => result.ref)));
        return bulkSummaryOf(action, results);
    };
    const bulkRun = useBulkRun(runOnSelected);

    // A filter or a search changes which rows the ticks stand for.
    useEffect(() => {
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
    const ticked = (rows ?? []).filter((row) => selected.has(row.ref)).length;
    const nothingYet = rows !== undefined && rows.length === 0 && query.trim() === '' && !filtering;
    // Rows arrive filtered, so drafts are counted only while they are all there.
    const drafts = filtering ? 0 : (rows ?? []).filter((row) => row.status === 'draft').length;

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
                            total={sorted.length}
                            actions={bulk.actions}
                            bulk={bulkRun}
                            onSelectAll={() => setSelected(new Set(sorted.map((row) => row.ref)))}
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
                            <TreeRows rows={sorted} options={options} onMove={nested.onMove} />
                        ) : (
                            <>
                                <FlatRows rows={shownPage.rows} options={options} />
                                <Pager
                                    page={shownPage.page}
                                    pageCount={shownPage.pageCount}
                                    first={shownPage.first}
                                    last={shownPage.last}
                                    total={sorted.length}
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

interface PageEntry {
    ref: string;
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
export function PagesList({ connection, routes }: { connection: Connection; routes?: Readonly<Record<string, AdminRoute>> }) {
    const [rows, setRows] = useState<TreeRow[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [loads, setLoads] = useState(0);
    const nameOf = useNames(connection);
    useEffect(() => {
        void connection.call<{ pages: PageEntry[] }>('editing_pages_list').then((answer) => {
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The pages did not load'));
                return;
            }
            setRows(
                answer.body.pages
                    .filter((page) => page.ref.startsWith('page:'))
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
                    }))
            );
        });
    }, [connection, loads]);
    const actions = offeredActions(routes ?? {}, 'editing_pages');
    return (
        <ListScreen
            list="pages"
            title="Pages"
            noun="pages"
            rows={rows}
            problem={problem}
            columns={DOCUMENT_COLUMNS}
            defaultSort={NEWEST_FIRST}
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
}

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
 * One collection's items, newest change first, or nested under their
 * parents for a collection with a `tree`. The filters ask the list route
 * once for each field they name, and ticked rows get the selection's
 * actions.
 */
export function CollectionList({
    connection,
    collection,
    options,
    routes,
    onOpen,
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
}) {
    const [answers, setAnswers] = useState<ReadonlyMap<string, ItemEntry[]> | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [creating, setCreating] = useState(false);
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [moveProblem, setMoveProblem] = useState<string | undefined>();
    const [loads, setLoads] = useState(0);
    const nameOf = useNames(connection);
    const name = collection.name;
    const tree = options?.tree;
    // Changing how two conditions join asks nothing new, so the queries follow their key.
    const queriesKey = JSON.stringify(itemQueriesOf(filters));
    const queries = useMemo(() => JSON.parse(queriesKey) as Array<Record<string, string | boolean>>, [queriesKey]);

    useEffect(() => {
        let current = true;
        setProblem(undefined);
        void Promise.all(
            queries.map((query) =>
                connection.call<{ items: ItemEntry[] }>('editing_collections_list_items', {
                    params: {
                        name,
                    },
                    query,
                })
            )
        ).then((listed) => {
            if (!current) return;
            const failed = listed.find((answer) => answer.status !== 200);
            if (failed !== undefined) {
                setProblem(problemOf(failed, 'The items did not load'));
                return;
            }
            setAnswers(new Map(queries.map((query, index) => [queryKeyOf(query), listed[index]!.body.items])));
        });
        return () => {
            current = false;
        };
    }, [connection, name, queries, loads]);

    const rows = useMemo<TreeRow[] | undefined>(() => {
        const every = answers?.get(queryKeyOf({}));
        if (answers === undefined || every === undefined) return undefined;
        const held = new Map([...answers].map(([key, items]) => [key, new Set(items.map((item) => item.ref))]));
        const kept = filterItems(every, filters, (query) => held.get(queryKeyOf(query)));
        const ordered =
            tree === undefined
                ? kept
                : kept.sort((left, right) => (left.treeLabel ?? left.label).localeCompare(right.treeLabel ?? right.label));
        return ordered.map((item) => ({
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
            tree:
                tree === undefined
                    ? undefined
                    : {
                          id: item.id,
                          parent: item.parent ?? null,
                          label: item.label,
                      },
        }));
    }, [answers, filters, tree]);

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

    const move = async (dragged: TreePlace, target: TreePlace | null): Promise<void> => {
        const parent = parentAfterDrop(dragged, target);
        if (tree === undefined || parent === undefined) return;
        setMoveProblem(undefined);
        const answer = await connection.call('editing_collections_update_draft', {
            params: {
                name,
                id: dragged.id,
            },
            body: {
                changes: parentChange(tree, parent),
            },
        });
        if (answer.status !== 200) {
            setMoveProblem(problemOf(answer, `${dragged.label} was not moved`));
            return;
        }
        setLoads((count) => count + 1);
    };

    const actions = offeredActions(routes);
    const noun = collection.label.toLowerCase();

    return (
        <ListScreen
            list={`collections:${name}`}
            title={collection.label}
            noun={noun}
            rows={rows}
            total={answers?.get(queryKeyOf({}))?.length}
            problem={problem}
            columns={DOCUMENT_COLUMNS}
            defaultSort={tree === undefined ? NEWEST_FIRST : undefined}
            defaultSortLabel="Tree order"
            nameOf={nameOf}
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
                              const results = await runBulk(action, targets, (tool, input) => connection.call(tool, input));
                              setLoads((count) => count + 1);
                              return results;
                          },
                      }
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
                          onMove: (dragged, target) => void move(dragged, target),
                      }
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
