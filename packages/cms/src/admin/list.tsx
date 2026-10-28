import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CircleAlert, Plus, Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { humanize } from '../view/schema.js';
import { BulkBar } from './bulk-bar.js';
import { bulkSummaryOf, offeredActions, runBulk, type BulkAction, type BulkSummary } from './bulk.js';
import type { AdminRoute, ListOptions } from './config.js';
import { FilterChips } from './filter-chips.js';
import { NO_FILTERS, hasStatus, inEvery, isFiltering, itemQueriesOf, type Filters } from './list-filters.js';
import { FlatRows, TreeRows, type ListRow, type Selection } from './list-rows.js';
import { parentAfterDrop, parentChange, type TreePlace } from './list-tree.js';
import type { CollectionSummary } from './navigation.js';
import { Loading, Topbar, problemOf } from './parts.js';

/**
 * How many rows a list shows at once.
 */
export const PAGE_SIZE = 25;

/**
 * The page numbers a pager offers: the first, the last, and those around the
 * one shown, with `null` where some are skipped.
 */
export const pagesAround = (current: number, count: number): Array<number | null> => {
    const numbers: Array<number | null> = [];
    for (let page = 0; page < count; page += 1) {
        if (page === 0 || page === count - 1 || Math.abs(page - current) <= 1) numbers.push(page);
        else if (numbers.at(-1) !== null) numbers.push(null);
    }
    return numbers;
};

/**
 * Rows with a title, status and when each last changed, searched by title
 * and shown a page at a time. With `tree`, and nothing searched for, the
 * rows show nested instead, all at once.
 */
export function ListScreen({
    crumb,
    title,
    rows,
    problem,
    actions,
    above,
    filtering = false,
    selection,
    tree,
}: {
    crumb: string;
    title: string;
    rows: readonly ListRow[] | undefined;
    problem: string | undefined;
    actions?: ReactNode;
    /**
     * Between the search box and the rows, like filters and the bulk bar.
     */
    above?: ReactNode;
    /**
     * A filter is hiding some of the rows.
     */
    filtering?: boolean;
    selection?: Selection | undefined;
    tree?:
        | {
              onMove: (dragged: TreePlace, target: TreePlace | null) => void;
          }
        | undefined;
}) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const matching = useMemo(() => {
        const search = query.trim().toLowerCase();
        return (rows ?? []).filter(
            (row) => search === '' || row.title.toLowerCase().includes(search) || (row.detail ?? '').toLowerCase().includes(search)
        );
    }, [rows, query]);
    const nested = query.trim() === '' ? tree : undefined;
    const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
    const shownPage = Math.min(page, pageCount - 1);
    const shown = matching.slice(shownPage * PAGE_SIZE, (shownPage + 1) * PAGE_SIZE);

    return (
        <>
            <Topbar crumb={crumb} title={title}>
                {rows === undefined ? null : <span className="k-status">{rows.length}</span>}
                <span className="k-admin-spacer" />
                {actions}
            </Topbar>
            <div className="k-admin-body">
                <label className="k-admin-search">
                    <Search {...ICON} />
                    <input
                        type="search"
                        placeholder="Search titles"
                        aria-label={`Search ${title.toLowerCase()}`}
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setPage(0);
                        }}
                    />
                </label>
                {above}
                {rows === undefined ? (
                    <Loading problem={problem} />
                ) : matching.length === 0 ? (
                    <div className="k-empty-state">
                        <p className="k-empty-title">
                            {rows.length === 0 && !filtering ? `Nothing in ${title.toLowerCase()} yet` : 'Nothing matches'}
                        </p>
                    </div>
                ) : nested !== undefined ? (
                    <TreeRows label={title} rows={matching} selection={selection} onMove={nested.onMove} />
                ) : (
                    <FlatRows label={title} rows={shown} selection={selection} />
                )}
                {nested === undefined && matching.length > PAGE_SIZE ? (
                    <nav className="k-admin-pager" aria-label="Pages of the list">
                        <span>
                            {shownPage * PAGE_SIZE + 1} to {Math.min((shownPage + 1) * PAGE_SIZE, matching.length)} of {matching.length}
                        </span>
                        <span className="k-admin-pager-pages">
                            <button
                                type="button"
                                className="k-icon-button"
                                aria-label="Previous page"
                                disabled={shownPage === 0}
                                onClick={() => setPage(shownPage - 1)}>
                                <ChevronLeft {...ICON} />
                            </button>
                            {pagesAround(shownPage, pageCount).map((number, index) =>
                                number === null ? (
                                    <span key={`gap-${index}`} className="k-admin-pager-gap">
                                        …
                                    </span>
                                ) : (
                                    <button
                                        key={number}
                                        type="button"
                                        className="k-tab"
                                        aria-current={number === shownPage ? 'page' : undefined}
                                        aria-selected={number === shownPage}
                                        onClick={() => setPage(number)}>
                                        {number + 1}
                                    </button>
                                )
                            )}
                            <button
                                type="button"
                                className="k-icon-button"
                                aria-label="Next page"
                                disabled={shownPage === pageCount - 1}
                                onClick={() => setPage(shownPage + 1)}>
                                <ChevronRight {...ICON} />
                            </button>
                        </span>
                    </nav>
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
}

/**
 * Every page the CMS holds content for, by its path on the site.
 */
export function PagesList({ connection }: { connection: Connection }) {
    const [rows, setRows] = useState<ListRow[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
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
                        title: page.label ?? humanize(page.name.replace(/Page$/, '')),
                        detail: page.path,
                        status: page.status,
                        updatedAt: page.updatedAt,
                    }))
            );
        });
    }, [connection]);
    return <ListScreen crumb="Content" title="Pages" rows={rows} problem={problem} />;
}

interface ItemEntry {
    id: string;
    ref: string;
    label: string;
    path: string | null;
    status: string;
    updatedAt: string;
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
 * parents for a collection with a `tree`. Chips filter them, and ticked rows
 * get the bulk bar.
 */
export function CollectionList({
    connection,
    collection,
    group,
    options,
    routes,
    onOpen,
}: {
    connection: Connection;
    collection: CollectionSummary;
    group: string;
    options: ListOptions | undefined;
    routes: Readonly<Record<string, AdminRoute>>;
    onOpen: (ref: string) => void;
}) {
    const [items, setItems] = useState<ItemEntry[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [creating, setCreating] = useState(false);
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [moveProblem, setMoveProblem] = useState<string | undefined>();
    const [loads, setLoads] = useState(0);
    const name = collection.name;
    const tree = options?.tree;

    useEffect(() => {
        let current = true;
        setProblem(undefined);
        void Promise.all(
            itemQueriesOf(filters.fields).map((query) =>
                connection.call<{ items: ItemEntry[] }>('editing_collections_list_items', {
                    params: {
                        name,
                    },
                    query,
                })
            )
        ).then((answers) => {
            if (!current) return;
            const failed = answers.find((answer) => answer.status !== 200);
            if (failed !== undefined) {
                setProblem(problemOf(failed, 'The items did not load'));
                return;
            }
            setItems(inEvery(answers.map((answer) => answer.body.items)));
        });
        return () => {
            current = false;
        };
    }, [connection, name, filters.fields, loads]);

    const rows = useMemo<ListRow[] | undefined>(() => {
        if (items === undefined) return undefined;
        const kept = items.filter((item) => hasStatus(item, filters.status));
        const ordered =
            tree === undefined
                ? kept.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                : kept.sort((left, right) => (left.treeLabel ?? left.label).localeCompare(right.treeLabel ?? right.label));
        return ordered.map((item) => ({
            ref: item.ref,
            title: item.treeLabel ?? item.label,
            detail: item.path ?? undefined,
            status: item.status,
            updatedAt: item.updatedAt,
            tree:
                tree === undefined
                    ? undefined
                    : {
                          id: item.id,
                          parent: item.parent ?? null,
                          label: item.label,
                      },
        }));
    }, [items, filters.status, tree]);

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

    const runOnSelected = async (action: BulkAction): Promise<BulkSummary> => {
        const targets = (rows ?? [])
            .filter((row) => selected.has(row.ref))
            .map((row) => ({
                ref: row.ref,
                title: row.tree?.label ?? row.title,
            }));
        const results = await runBulk(action, targets, (tool, input) => connection.call(tool, input));
        // The items it did not run on stay ticked, to try again.
        setSelected(new Set(results.filter((result) => result.problem !== undefined).map((result) => result.ref)));
        setLoads((count) => count + 1);
        return bulkSummaryOf(action, results);
    };

    const actions = offeredActions(routes);

    return (
        <>
            <ListScreen
                crumb={group}
                title={collection.label}
                rows={rows}
                problem={problem}
                filtering={isFiltering(filters)}
                selection={
                    actions.length === 0
                        ? undefined
                        : {
                              selected,
                              onChange: setSelected,
                          }
                }
                tree={
                    tree === undefined || isFiltering(filters)
                        ? undefined
                        : {
                              onMove: (dragged, target) => void move(dragged, target),
                          }
                }
                above={
                    <>
                        <FilterChips
                            connection={connection}
                            filters={options?.filters ?? []}
                            value={filters}
                            onChange={(next) => {
                                setFilters(next);
                                setSelected(new Set());
                            }}
                        />
                        <BulkBar count={selected.size} actions={actions} onRun={runOnSelected} onClear={() => setSelected(new Set())} />
                        {moveProblem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {moveProblem}
                            </p>
                        )}
                    </>
                }
                actions={
                    <button
                        type="button"
                        className="k-button k-button-primary k-button-small"
                        disabled={creating}
                        onClick={() => void create()}>
                        <Plus {...ICON} />
                        New item
                    </button>
                }
            />
            {rows !== undefined && problem !== undefined ? (
                <p className="k-error k-admin-body" role="alert">
                    {problem}
                </p>
            ) : null}
        </>
    );
}
