import type { ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Toggle } from '@base-ui/react/toggle';
import { ArrowUpDown, Check, Columns3, ListFilter as FilterIcon, Plus, Search } from 'lucide-react';
import { ICON } from '../view/context.js';
import type { ListColumn, Sort, SortDirection } from './list-columns.js';

/**
 * The panels the toolbar opens under it, one at a time.
 */
export type ListPanel = 'filters' | 'columns';

/**
 * The search box, and the buttons for the filters, the columns and the sort
 * on the right.
 */
export function ListToolbar({
    label,
    query,
    placeholder,
    onQuery,
    panel,
    onPanel,
    panelIds,
    filterCount,
    hasFilters,
    sort,
}: {
    label: string;
    query: string;
    placeholder: string;
    onQuery: (query: string) => void;
    panel: ListPanel | undefined;
    onPanel: (panel: ListPanel | undefined) => void;
    panelIds: Record<ListPanel, string>;
    /**
     * How many conditions filter the list, shown on the button.
     */
    filterCount: number;
    hasFilters: boolean;
    sort: ReactNode;
}) {
    const toggle = (which: ListPanel): void => onPanel(panel === which ? undefined : which);
    return (
        <div className="k-list-toolbar">
            <label className="k-list-toolbar__search">
                <Search {...ICON} />
                <span className="k-visually-hidden">Search {label.toLowerCase()}</span>
                <input type="search" placeholder={placeholder} value={query} onChange={(event) => onQuery(event.target.value)} />
            </label>
            <div className="k-list-toolbar__buttons">
                {hasFilters ? (
                    <button
                        type="button"
                        className="k-button k-button--small k-button--secondary k-list-toolbar__button"
                        aria-expanded={panel === 'filters'}
                        aria-controls={panelIds.filters}
                        onClick={() => toggle('filters')}>
                        <FilterIcon {...ICON} />
                        Filters
                        {filterCount === 0 ? null : (
                            <span className="k-list-toolbar__badge" aria-label={`${filterCount} active`}>
                                {filterCount}
                            </span>
                        )}
                    </button>
                ) : null}
                <button
                    type="button"
                    className="k-button k-button--small k-button--secondary k-list-toolbar__button"
                    aria-expanded={panel === 'columns'}
                    aria-controls={panelIds.columns}
                    onClick={() => toggle('columns')}>
                    <Columns3 {...ICON} />
                    Columns
                </button>
                {sort}
            </div>
        </div>
    );
}

/**
 * Every column as a chip, pressed while it shows.
 */
export function ColumnsPanel({
    id,
    columns,
    shown,
    onChange,
}: {
    id: string;
    columns: readonly ListColumn[];
    shown: ReadonlySet<string>;
    onChange: (keys: string[]) => void;
}) {
    return (
        <section id={id} className="k-list-panel k-columns-panel" aria-labelledby={`${id}-heading`}>
            <h2 id={`${id}-heading`} className="k-columns-panel__heading">
                Columns in the table
            </h2>
            <div className="k-columns-panel__chips">
                {columns.map((column) => {
                    const pressed = column.fixed === true || shown.has(column.key);
                    return (
                        <Toggle
                            key={column.key}
                            className="k-columns-panel__chip"
                            pressed={pressed}
                            disabled={column.fixed === true}
                            onPressedChange={(next) =>
                                onChange(
                                    columns
                                        .filter((candidate) => (candidate.key === column.key ? next : shown.has(candidate.key)))
                                        .map((candidate) => candidate.key)
                                )
                            }>
                            {pressed ? <Check {...ICON} /> : <Plus {...ICON} />}
                            {column.label}
                        </Toggle>
                    );
                })}
            </div>
        </section>
    );
}

const DIRECTIONS: Record<SortDirection, string> = {
    ascending: 'Ascending',
    descending: 'Descending',
};

/**
 * The column the rows sort by, and which way, in a menu. Without a sort the
 * rows keep the order they arrive in, or their tree.
 */
export function SortMenu({
    columns,
    sort,
    defaultLabel,
    onChange,
}: {
    columns: readonly ListColumn[];
    sort: Sort | undefined;
    /**
     * The name of the order the rows arrive in, offered when they have one.
     */
    defaultLabel: string | undefined;
    onChange: (sort: Sort | undefined) => void;
}) {
    const DEFAULT = '';
    return (
        <Menu.Root>
            <Menu.Trigger className="k-button k-button--small k-button--secondary k-list-toolbar__button">
                <ArrowUpDown {...ICON} />
                Sort
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                    <Menu.Popup className="k-popup k-menu k-sort-menu">
                        <Menu.Group>
                            <Menu.GroupLabel className="k-sort-menu__label">Sort by</Menu.GroupLabel>
                            <Menu.RadioGroup
                                value={sort?.column ?? DEFAULT}
                                onValueChange={(column: string) =>
                                    onChange(
                                        column === DEFAULT
                                            ? undefined
                                            : {
                                                  column,
                                                  direction:
                                                      sort?.direction ??
                                                      (columns.find((candidate) => candidate.key === column)?.kind === 'date'
                                                          ? 'descending'
                                                          : 'ascending'),
                                              }
                                    )
                                }>
                                {defaultLabel === undefined ? null : (
                                    <Menu.RadioItem value={DEFAULT} className="k-menu__item" closeOnClick>
                                        {defaultLabel}
                                        <Menu.RadioItemIndicator className="k-menu__check">
                                            <Check {...ICON} />
                                        </Menu.RadioItemIndicator>
                                    </Menu.RadioItem>
                                )}
                                {columns.map((column) => (
                                    <Menu.RadioItem key={column.key} value={column.key} className="k-menu__item" closeOnClick>
                                        {column.label}
                                        <Menu.RadioItemIndicator className="k-menu__check">
                                            <Check {...ICON} />
                                        </Menu.RadioItemIndicator>
                                    </Menu.RadioItem>
                                ))}
                            </Menu.RadioGroup>
                        </Menu.Group>
                        {sort === undefined ? null : (
                            <>
                                <Menu.Separator className="k-sort-menu__separator" />
                                <Menu.Group>
                                    <Menu.GroupLabel className="k-sort-menu__label">Order</Menu.GroupLabel>
                                    <Menu.RadioGroup
                                        value={sort.direction}
                                        onValueChange={(direction: SortDirection) =>
                                            onChange({
                                                column: sort.column,
                                                direction,
                                            })
                                        }>
                                        {(['ascending', 'descending'] satisfies SortDirection[]).map((direction) => (
                                            <Menu.RadioItem key={direction} value={direction} className="k-menu__item" closeOnClick>
                                                {DIRECTIONS[direction]}
                                                <Menu.RadioItemIndicator className="k-menu__check">
                                                    <Check {...ICON} />
                                                </Menu.RadioItemIndicator>
                                            </Menu.RadioItem>
                                        ))}
                                    </Menu.RadioGroup>
                                </Menu.Group>
                            </>
                        )}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
