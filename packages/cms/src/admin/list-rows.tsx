import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ChevronsUpDown, Minus } from 'lucide-react';
import { ICON } from '../view/context.js';
import { dateTimeOf, nextSort, type ListColumn, type ListRow, type Sort } from './list-columns.js';
import { treeLinesOf, type TreePlace } from './list-tree.js';
import { cellText } from './views.js';

/**
 * The rows ticked for the selection's actions, by ref.
 */
export interface Selection {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
}

/**
 * A row that can sit in a tree, in a collection with one.
 */
export interface TreeRow extends ListRow {
    tree?: TreePlace | undefined;
}

const STATUS_LABEL: Record<string, string> = {
    empty: 'Not started',
    draft: 'Draft',
    published: 'Published',
    changed: 'Changed',
};

const toggled = (selected: ReadonlySet<string>, refs: readonly string[], on: boolean): Set<string> => {
    const next = new Set(selected);
    for (const ref of refs) {
        if (on) next.add(ref);
        else next.delete(ref);
    }
    return next;
};

/**
 * A row's tick box, or the head's, which shows a dash while only some rows
 * are ticked.
 */
function Tick({
    label,
    checked,
    indeterminate = false,
    onChange,
}: {
    label: string;
    checked: boolean;
    indeterminate?: boolean;
    onChange: (checked: boolean) => void;
}) {
    return (
        <Checkbox.Root
            className="k-check"
            aria-label={label}
            checked={checked}
            indeterminate={indeterminate}
            onCheckedChange={(next) => onChange(next)}>
            <Checkbox.Indicator className="k-check__indicator">
                {indeterminate ? <Minus {...ICON} /> : <Check {...ICON} />}
            </Checkbox.Indicator>
        </Checkbox.Root>
    );
}

/**
 * Where a row stands, as a dot and a word.
 */
export function ListStatus({ status }: { status: string }) {
    return (
        <span className="k-table__status" data-status={status}>
            <span className="k-table__dot" aria-hidden="true" />
            {STATUS_LABEL[status] ?? status}
        </span>
    );
}

/**
 * How the table reads each column and sorts by it.
 */
export interface TableOptions {
    label: string;
    columns: readonly ListColumn[];
    selection?: Selection | undefined;
    sort?: Sort | undefined;
    onSort?: ((sort: Sort) => void) | undefined;
    /**
     * A person's name, by their id.
     */
    nameOf: (id: string) => string;
}

function Head({ rows, options }: { rows: readonly ListRow[]; options: TableOptions }) {
    const { selection, sort, onSort, label } = options;
    const ticked = rows.filter((row) => selection?.selected.has(row.ref)).length;
    return (
        <thead>
            <tr>
                {selection === undefined ? null : (
                    <th scope="col" className="k-table__select">
                        <Tick
                            label={
                                ticked > 0 && ticked < rows.length
                                    ? `Select all ${label.toLowerCase()} on this page, ${ticked} of ${rows.length} selected`
                                    : `Select all ${label.toLowerCase()} on this page`
                            }
                            checked={rows.length > 0 && ticked === rows.length}
                            indeterminate={ticked > 0 && ticked < rows.length}
                            onChange={(checked) =>
                                selection.onChange(
                                    toggled(
                                        selection.selected,
                                        rows.map((row) => row.ref),
                                        checked
                                    )
                                )
                            }
                        />
                    </th>
                )}
                {options.columns.map((column) => {
                    const sorted = sort?.column === column.key ? sort.direction : undefined;
                    return (
                        <th
                            key={column.key}
                            scope="col"
                            className="k-table__heading"
                            data-kind={column.kind}
                            aria-sort={sorted ?? undefined}>
                            {onSort === undefined || rows.length === 0 ? (
                                column.label
                            ) : (
                                <button
                                    type="button"
                                    className="k-table__sort"
                                    aria-pressed={sorted !== undefined}
                                    onClick={() => onSort(nextSort(sort, column))}>
                                    {column.label}
                                    {sorted === 'ascending' ? (
                                        <ArrowUp {...ICON} />
                                    ) : sorted === 'descending' ? (
                                        <ArrowDown {...ICON} />
                                    ) : (
                                        <ChevronsUpDown {...ICON} />
                                    )}
                                </button>
                            )}
                        </th>
                    );
                })}
            </tr>
        </thead>
    );
}

function Cell({ row, column, options, lead }: { row: ListRow; column: ListColumn; options: TableOptions; lead?: ReactNode }) {
    if (column.kind === 'title') {
        const name = (
            <span className="k-table__name">
                <a className="k-table__link" draggable={false} href={row.href}>
                    {row.title}
                </a>
                {row.detail === undefined ? null : <span className="k-table__detail">{row.detail}</span>}
            </span>
        );
        return (
            <td className="k-table__title" data-kind="title">
                {lead === undefined ? (
                    name
                ) : (
                    <div className="k-table__tree">
                        {lead}
                        {name}
                    </div>
                )}
            </td>
        );
    }
    const content =
        column.kind === 'status' ? (
            row.status === undefined ? null : (
                <ListStatus status={row.status} />
            )
        ) : column.kind === 'date' ? (
            dateTimeOf(row.updatedAt)
        ) : column.kind === 'person' ? (
            row.updatedBy === undefined ? null : (
                options.nameOf(row.updatedBy)
            )
        ) : (
            cellText(row.values?.[column.key])
        );
    return <td data-kind={column.kind}>{content}</td>;
}

interface LineProps {
    row: ListRow;
    title: string;
    options: TableOptions;
    /**
     * Before the title: the tree's indent and its caret.
     */
    lead?: ReactNode;
    depth?: number;
    drop?: {
        over: boolean;
        onDragStart: (event: DragEvent) => void;
        onDragEnd: () => void;
        onDragOver: (event: DragEvent) => void;
        onDragLeave: (event: DragEvent) => void;
        onDrop: (event: DragEvent) => void;
    };
}

function Line({ row, title, options, lead, depth, drop }: LineProps) {
    const { selection } = options;
    const selected = selection?.selected.has(row.ref) === true;
    return (
        <tr
            className="k-table__row"
            data-selected={selected ? '' : undefined}
            data-over={drop?.over === true ? '' : undefined}
            draggable={drop === undefined ? undefined : true}
            style={
                depth === undefined
                    ? undefined
                    : ({
                          '--k-depth': depth,
                      } as CSSProperties)
            }
            {...(drop === undefined
                ? {}
                : {
                      onDragStart: drop.onDragStart,
                      onDragEnd: drop.onDragEnd,
                      onDragOver: drop.onDragOver,
                      onDragLeave: drop.onDragLeave,
                      onDrop: drop.onDrop,
                  })}>
            {selection === undefined ? null : (
                <td className="k-table__select">
                    <Tick
                        label={`Select ${title}`}
                        checked={selected}
                        onChange={(checked) => selection.onChange(toggled(selection.selected, [row.ref], checked))}
                    />
                </td>
            )}
            {options.columns.map((column) => (
                <Cell key={column.key} row={row} column={column} options={options} lead={column.kind === 'title' ? lead : undefined} />
            ))}
        </tr>
    );
}

/**
 * The table a list sits in: the header row, then `children` or, with none,
 * what `empty` says under the header.
 */
function Table({ rows, options, children }: { rows: readonly ListRow[]; options: TableOptions; children: ReactNode }) {
    return (
        <div className="k-table__scroll">
            <table className="k-table" aria-label={options.label} data-selectable={options.selection === undefined ? undefined : ''}>
                <Head rows={rows} options={options} />
                {rows.length === 0 ? null : <tbody>{children}</tbody>}
            </table>
        </div>
    );
}

/**
 * Rows in the order given, each opening its item from the title.
 */
export function FlatRows({ rows, options }: { rows: readonly ListRow[]; options: TableOptions }) {
    return (
        <Table rows={rows} options={options}>
            {rows.map((row) => (
                <Line key={row.ref} row={row} title={row.title} options={options} />
            ))}
        </Table>
    );
}

/**
 * Rows nested under their parents, each opening and closing on its caret.
 * Dragging a row onto another moves it under that one, and onto the row
 * above the others moves it to the top.
 */
export function TreeRows({
    rows,
    options,
    onMove,
}: {
    rows: readonly TreeRow[];
    options: TableOptions;
    onMove: (dragged: TreePlace, target: TreePlace | null) => void;
}) {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [dragged, setDragged] = useState<TreePlace | undefined>();
    // The row a drop would land on, `null` for the top, `undefined` for none.
    const [over, setOver] = useState<string | null | undefined>();
    const lines = useMemo(() => treeLinesOf(rows, collapsed), [rows, collapsed]);
    const span = options.columns.length + (options.selection === undefined ? 0 : 1);

    const stop = (): void => {
        setDragged(undefined);
        setOver(undefined);
    };
    const leaving = (event: DragEvent, target: string | null): void => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setOver((current) => (current === target ? undefined : current));
    };
    const dropOn = (event: DragEvent, target: TreePlace | null): void => {
        event.preventDefault();
        if (dragged !== undefined) onMove(dragged, target);
        stop();
    };

    return (
        <Table rows={lines.map((line) => line.row)} options={options}>
            {dragged === undefined ? null : (
                <tr
                    className="k-table__drop-top"
                    data-over={over === null ? '' : undefined}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setOver(null);
                    }}
                    onDragLeave={(event) => leaving(event, null)}
                    onDrop={(event) => dropOn(event, null)}>
                    <td colSpan={span}>Drop here to move {dragged.label} to the top</td>
                </tr>
            )}
            {lines.map((line) => {
                const place = line.row.tree!;
                return (
                    <Line
                        key={line.row.ref}
                        row={{
                            ...line.row,
                            title: place.label,
                        }}
                        title={place.label}
                        options={options}
                        depth={line.depth}
                        lead={
                            line.hasChildren ? (
                                <button
                                    type="button"
                                    className="k-icon-button k-table__caret"
                                    aria-expanded={line.expanded}
                                    aria-label={line.expanded ? `Hide what is under ${place.label}` : `Show what is under ${place.label}`}
                                    onClick={() => {
                                        const next = new Set(collapsed);
                                        if (line.expanded) next.add(place.id);
                                        else next.delete(place.id);
                                        setCollapsed(next);
                                    }}>
                                    {line.expanded ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
                                </button>
                            ) : (
                                <span className="k-table__caret" aria-hidden="true" />
                            )
                        }
                        drop={{
                            over: over === place.id,
                            onDragStart: (event) => {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', line.row.ref);
                                setDragged(place);
                            },
                            onDragEnd: stop,
                            onDragOver: (event) => {
                                if (dragged === undefined || dragged.id === place.id) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                                setOver(place.id);
                            },
                            onDragLeave: (event) => leaving(event, place.id),
                            onDrop: (event) => dropOn(event, place),
                        }}
                    />
                );
            })}
        </Table>
    );
}

/**
 * The header row alone, for a list with nothing in it.
 */
export function EmptyTable({ options }: { options: TableOptions }) {
    return (
        <Table rows={[]} options={options}>
            {null}
        </Table>
    );
}
