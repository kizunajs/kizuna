import { useEffect, useMemo, useRef, useState } from 'react';
import type { Connection } from '../view/connection.js';
import type { ListRow, Sort } from './list-columns.js';
import { NO_FILTERS, filterEntriesOf, type Filters } from './list-filters.js';
import { ListScreen, PAGE_SIZE } from './list.js';
import { hrefOf } from './navigation.js';
import { problemOf } from './parts.js';
import {
    columnLabel,
    labelledValues,
    servesPages,
    viewColumnsOf,
    viewListCall,
    type ViewPageQuery,
    type ViewRow,
    type ViewSummary,
} from './views.js';

/**
 * How long the search waits after the last key before it asks the view.
 */
const SEARCH_DELAY = 250;

const EITHER = new Intl.ListFormat('en', {
    type: 'disjunction',
});

/**
 * What the search box says it looks in, like "Search by name or email".
 */
export const viewSearchPlaceholder = (view: ViewSummary): string =>
    view.search.length === 0 ? 'Search' : `Search by ${EITHER.format(view.search.map((field) => columnLabel(view, field).toLowerCase()))}`;

/**
 * A view's records, as its `list` returns them for what the editor searched,
 * and once the view names `filters` or `sorts`, filtered, sorted and paged
 * by `list` too. The app keeps the records, so the list adds none and ticks
 * none.
 */
export function ViewList({ connection, view }: { connection: Connection; view: ViewSummary; group?: string }) {
    const serves = servesPages(view);
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [sort, setSort] = useState<Sort | undefined>();
    const [page, setPage] = useState(0);
    const [perPage, setPerPage] = useState(PAGE_SIZE);
    const [listed, setListed] = useState<{ items: ViewRow[]; total: number } | undefined>();
    const [every, setEvery] = useState<number | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const asked = useRef(0);
    // The filter follows its key, so a new list of the same conditions asks nothing new.
    const filterKey = JSON.stringify(filterEntriesOf(filters));

    useEffect(() => {
        const pageQuery: ViewPageQuery | undefined = serves
            ? {
                  filter: JSON.parse(filterKey) as string[],
                  sort,
                  limit: perPage,
                  offset: page * perPage,
              }
            : undefined;
        const ask = async (): Promise<void> => {
            asked.current += 1;
            const asking = asked.current;
            const call = viewListCall(view.name, query, pageQuery);
            const answer = await connection.call<{ items: ViewRow[]; total: number }>(call.name, call.input);
            // A slower answer to an earlier search must not replace a newer one.
            if (asking !== asked.current) return;
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The records did not load'));
                return;
            }
            // A page past the end, after records went away, moves back to the last one.
            if (serves && answer.body.items.length === 0 && page > 0 && answer.body.total > 0) {
                setPage(Math.ceil(answer.body.total / perPage) - 1);
                return;
            }
            setProblem(undefined);
            setListed(answer.body);
        };
        const timer = window.setTimeout(() => void ask(), query === '' ? 0 : SEARCH_DELAY);
        return () => window.clearTimeout(timer);
    }, [connection, view.name, serves, query, filterKey, sort, page, perPage]);

    // The header counts every record, as a collection's does, while the rows arrive filtered.
    useEffect(() => {
        if (!serves) return;
        let current = true;
        const call = viewListCall(view.name, '', {
            filter: [],
            sort: undefined,
            limit: 1,
            offset: 0,
        });
        void connection.call<{ total: number }>(call.name, call.input).then((answer) => {
            if (current && answer.status === 200) setEvery(answer.body.total);
        });
        return () => {
            current = false;
        };
    }, [connection, view.name, serves]);

    const columns = useMemo(() => viewColumnsOf(view), [view]);
    const rows = useMemo<ListRow[] | undefined>(
        () =>
            listed?.items.map((row) => ({
                ref: row.id,
                href: hrefOf({
                    kind: 'record',
                    view: view.name,
                    id: row.id,
                }),
                title: row.title,
                values: labelledValues(view, row.values),
            })),
        [listed, view]
    );
    const noun = view.label.toLowerCase();

    return (
        <ListScreen
            list={`views:${view.name}`}
            title={view.label}
            noun={noun}
            rows={rows}
            total={serves ? (every ?? listed?.total) : undefined}
            problem={problem}
            columns={columns}
            defaultSort={undefined}
            defaultSortLabel="As the view lists them"
            empty={{
                title: `No ${noun} yet`,
                description: 'The view lists what the app holds, and the app holds none yet.',
            }}
            facts={[
                view.readOnly
                    ? {
                          label: 'Access',
                          value: 'Read only',
                      }
                    : null,
            ]}
            search={{
                query,
                onQuery: setQuery,
                placeholder: viewSearchPlaceholder(view),
            }}
            server={
                serves
                    ? {
                          sort,
                          onSort: (next) => {
                              setSort(next);
                              setPage(0);
                          },
                          page,
                          onPage: setPage,
                          perPage,
                          onPerPage: setPerPage,
                          matching: listed?.total ?? 0,
                          selectAll: async () => [],
                      }
                    : undefined
            }
            filters={
                (view.filters ?? []).length === 0
                    ? undefined
                    : {
                          definitions: view.filters ?? [],
                          byStatus: false,
                          value: filters,
                          onChange: setFilters,
                          connection,
                      }
            }
        />
    );
}
