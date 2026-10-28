import { useMemo, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { Check, ChevronDown, ChevronRight, Minus } from 'lucide-react';
import { ICON } from '../view/context.js';
import { treeLinesOf, type TreePlace } from './list-tree.js';
import { hrefOf } from './navigation.js';
import { Status, dayOf } from './parts.js';

export interface ListRow {
    ref: string;
    title: string;
    /**
     * Shown under the title, like a page's path.
     */
    detail?: string | undefined;
    status: string;
    updatedAt: string | null;
    /**
     * Where the item sits, in a collection with a `tree`.
     */
    tree?: TreePlace | undefined;
}

/**
 * The rows ticked for the bulk bar, by ref.
 */
export interface Selection {
    selected: ReadonlySet<string>;
    onChange: (selected: Set<string>) => void;
}

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
            <Checkbox.Indicator className="k-check-indicator">
                {indeterminate ? <Minus {...ICON} /> : <Check {...ICON} />}
            </Checkbox.Indicator>
        </Checkbox.Root>
    );
}

function Head({ rows, selection }: { rows: readonly ListRow[]; selection: Selection | undefined }) {
    const ticked = rows.filter((row) => selection?.selected.has(row.ref)).length;
    return (
        <div className="k-admin-row k-admin-row-head" role="row">
            {selection === undefined ? null : (
                <span role="columnheader">
                    <Tick
                        label="Select every row shown"
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
                </span>
            )}
            <span role="columnheader">Title</span>
            <span role="columnheader">Status</span>
            <span role="columnheader" className="k-admin-hide">
                Updated
            </span>
        </div>
    );
}

interface LineProps {
    row: ListRow;
    title: string;
    selection: Selection | undefined;
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

function Line({ row, title, selection, lead, depth, drop }: LineProps) {
    return (
        <div
            className="k-admin-row"
            role="row"
            data-linked=""
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
                <span role="cell">
                    <Tick
                        label={`Select ${title}`}
                        checked={selection.selected.has(row.ref)}
                        onChange={(checked) => selection.onChange(toggled(selection.selected, [row.ref], checked))}
                    />
                </span>
            )}
            <span role="cell" className="k-admin-row-title" data-tree={lead === undefined ? undefined : ''}>
                {lead}
                <a
                    className="k-admin-row-link"
                    draggable={false}
                    href={hrefOf({
                        kind: 'document',
                        ref: row.ref,
                    })}>
                    <span className="k-ellipsis">{lead === undefined ? row.title : (row.tree?.label ?? row.title)}</span>
                    {row.detail === undefined ? null : <span className="k-admin-row-detail">{row.detail}</span>}
                </a>
            </span>
            <span role="cell">
                <Status status={row.status} />
            </span>
            <span role="cell" className="k-admin-date k-admin-hide">
                {dayOf(row.updatedAt)}
            </span>
        </div>
    );
}

/**
 * Rows in the order given, each opening its item.
 */
export function FlatRows({ label, rows, selection }: { label: string; rows: readonly ListRow[]; selection?: Selection | undefined }) {
    return (
        <div className="k-admin-rows" role="table" aria-label={label} data-selectable={selection === undefined ? undefined : ''}>
            <Head rows={rows} selection={selection} />
            {rows.map((row) => (
                <Line key={row.ref} row={row} title={row.title} selection={selection} />
            ))}
        </div>
    );
}

/**
 * Rows nested under their parents, each opening and closing on its caret.
 * Dragging a row onto another moves it under that one, and onto the area
 * above the rows moves it to the top.
 */
export function TreeRows({
    label,
    rows,
    selection,
    onMove,
}: {
    label: string;
    rows: readonly ListRow[];
    selection?: Selection | undefined;
    onMove: (dragged: TreePlace, target: TreePlace | null) => void;
}) {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [dragged, setDragged] = useState<TreePlace | undefined>();
    // The row a drop would land on, `null` for the top, `undefined` for none.
    const [over, setOver] = useState<string | null | undefined>();
    const lines = useMemo(() => treeLinesOf(rows, collapsed), [rows, collapsed]);

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
        <div className="k-admin-rows" role="table" aria-label={label} data-selectable={selection === undefined ? undefined : ''}>
            <Head rows={lines.map((line) => line.row)} selection={selection} />
            {dragged === undefined ? null : (
                <div
                    className="k-admin-drop-top"
                    data-over={over === null ? '' : undefined}
                    onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setOver(null);
                    }}
                    onDragLeave={(event) => leaving(event, null)}
                    onDrop={(event) => dropOn(event, null)}>
                    Drop here to move {dragged.label} to the top
                </div>
            )}
            {lines.map((line) => {
                const place = line.row.tree!;
                return (
                    <Line
                        key={line.row.ref}
                        row={line.row}
                        title={place.label}
                        selection={selection}
                        depth={line.depth}
                        lead={
                            line.hasChildren ? (
                                <button
                                    type="button"
                                    className="k-icon-button k-admin-caret"
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
                                <span className="k-admin-caret" aria-hidden="true" />
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
        </div>
    );
}
