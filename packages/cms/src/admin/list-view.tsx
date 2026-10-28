import { useEffect, useMemo, useRef, useState } from 'react';
import type { Connection } from '../view/connection.js';
import type { ListColumn, ListRow } from './list-columns.js';
import { ListScreen } from './list.js';
import { hrefOf } from './navigation.js';
import { problemOf } from './parts.js';
import { columnLabel, columnsOf, viewListCall, type ViewRow, type ViewSummary } from './views.js';

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
    view.search.length === 0 ? 'Search' : `Search by ${EITHER.format(view.search.map((field) => columnLabel(field).toLowerCase()))}`;

/**
 * A view's records, as its `list` returns them for what the editor searched.
 * The app keeps the records, so the list adds none and ticks none.
 */
export function ViewList({ connection, view }: { connection: Connection; view: ViewSummary; group?: string }) {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<ViewRow[] | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const asked = useRef(0);

    useEffect(() => {
        const ask = async (): Promise<void> => {
            asked.current += 1;
            const asking = asked.current;
            const call = viewListCall(view.name, query);
            const answer = await connection.call<{ items: ViewRow[] }>(call.name, call.input);
            // A slower answer to an earlier search must not replace a newer one.
            if (asking !== asked.current) return;
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The records did not load'));
                return;
            }
            setProblem(undefined);
            setRows(answer.body.items);
        };
        const timer = window.setTimeout(() => void ask(), query === '' ? 0 : SEARCH_DELAY);
        return () => window.clearTimeout(timer);
    }, [connection, view.name, query]);

    const columns = useMemo<ListColumn[]>(
        () =>
            columnsOf(view).map((column, index) => ({
                key: column,
                label: columnLabel(column),
                kind: index === 0 ? 'title' : 'text',
                shown: true,
                fixed: index === 0,
            })),
        [view]
    );
    const listed = useMemo<ListRow[] | undefined>(
        () =>
            rows?.map((row) => ({
                ref: row.id,
                href: hrefOf({
                    kind: 'record',
                    view: view.name,
                    id: row.id,
                }),
                title: row.title,
                values: row.values,
            })),
        [rows, view.name]
    );

    return (
        <ListScreen
            list={`views:${view.name}`}
            title={view.label}
            noun={view.label.toLowerCase()}
            rows={listed}
            problem={problem}
            columns={columns}
            defaultSort={undefined}
            defaultSortLabel="As the view lists them"
            empty={{
                title: `No ${view.label.toLowerCase()} yet`,
                description: 'The view lists what the app holds, and the app holds none yet.',
            }}
            facts={[view.readOnly ? 'Read only' : null]}
            search={{
                query,
                onQuery: setQuery,
                placeholder: viewSearchPlaceholder(view),
            }}
        />
    );
}
