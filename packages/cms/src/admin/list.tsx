import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { humanize } from '../view/schema.js';
import { hrefOf, type CollectionSummary } from './navigation.js';
import { Loading, Status, Topbar, dayOf, problemOf } from './parts.js';

/**
 * How many rows a list shows at once.
 */
export const PAGE_SIZE = 25;

export interface ListRow {
    ref: string;
    title: string;
    /**
     * Shown under the title, like a page's path.
     */
    detail?: string | undefined;
    status: string;
    updatedAt: string | null;
}

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
 * and shown a page at a time.
 */
export function ListScreen({
    crumb,
    title,
    rows,
    problem,
    actions,
}: {
    crumb: string;
    title: string;
    rows: readonly ListRow[] | undefined;
    problem: string | undefined;
    actions?: ReactNode;
}) {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const matching = useMemo(() => {
        const search = query.trim().toLowerCase();
        return (rows ?? []).filter(
            (row) => search === '' || row.title.toLowerCase().includes(search) || (row.detail ?? '').toLowerCase().includes(search)
        );
    }, [rows, query]);
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
                {rows === undefined ? (
                    <Loading problem={problem} />
                ) : matching.length === 0 ? (
                    <div className="k-empty-state">
                        <p className="k-empty-title">{rows.length === 0 ? `Nothing in ${title.toLowerCase()} yet` : 'Nothing matches'}</p>
                    </div>
                ) : (
                    <div className="k-admin-rows" role="table" aria-label={title}>
                        <div className="k-admin-row k-admin-row-head" role="row">
                            <span role="columnheader">Title</span>
                            <span role="columnheader">Status</span>
                            <span role="columnheader" className="k-admin-hide">
                                Updated
                            </span>
                        </div>
                        {shown.map((row) => (
                            <a
                                key={row.ref}
                                className="k-admin-row"
                                role="row"
                                href={hrefOf({
                                    kind: 'document',
                                    ref: row.ref,
                                })}>
                                <span role="cell" className="k-admin-row-title">
                                    <span className="k-ellipsis">{row.title}</span>
                                    {row.detail === undefined ? null : <span className="k-admin-row-detail">{row.detail}</span>}
                                </span>
                                <span role="cell">
                                    <Status status={row.status} />
                                </span>
                                <span role="cell" className="k-admin-date k-admin-hide">
                                    {dayOf(row.updatedAt)}
                                </span>
                            </a>
                        ))}
                    </div>
                )}
                {matching.length > PAGE_SIZE ? (
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
    ref: string;
    label: string;
    path: string | null;
    status: string;
    updatedAt: string;
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
 * One collection's items, newest change first.
 */
export function CollectionList({
    connection,
    collection,
    group,
    onOpen,
}: {
    connection: Connection;
    collection: CollectionSummary;
    group: string;
    onOpen: (ref: string) => void;
}) {
    const [rows, setRows] = useState<ListRow[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [creating, setCreating] = useState(false);
    const name = collection.name;
    useEffect(() => {
        setRows(undefined);
        setProblem(undefined);
        void connection
            .call<{ items: ItemEntry[] }>('editing_collections_list_items', {
                params: {
                    name,
                },
            })
            .then((answer) => {
                if (answer.status !== 200) {
                    setProblem(problemOf(answer, 'The items did not load'));
                    return;
                }
                setRows(
                    [...answer.body.items]
                        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                        .map((item) => ({
                            ref: item.ref,
                            title: item.label,
                            detail: item.path ?? undefined,
                            status: item.status,
                            updatedAt: item.updatedAt,
                        }))
                );
            });
    }, [connection, name]);

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

    return (
        <>
            <ListScreen
                crumb={group}
                title={collection.label}
                rows={rows}
                problem={problem}
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
