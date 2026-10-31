import {
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent as ReactKeyboardEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from 'react';
import { Checkbox } from '@base-ui/react/checkbox';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ChevronsUpDown, GripVertical, Minus } from 'lucide-react';
import { ICON } from '../view/context.js';
import { columnText, dateTimeOf, nextSort, type ListColumn, type ListRow, type Sort } from './list-columns.js';
import { heightIn, levelsAt, linesWithout, parentAt, placeAmongSiblings, placeAtSlot, placeOnto, type PlaceBody } from './list-order.js';
import { treeLinesOf, type TreePlace } from './list-tree.js';

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
    /**
     * The item's id, for a list in an order.
     */
    id?: string | undefined;
    /**
     * A part of a path with no page of its own, in grey and without a link.
     */
    segment?: boolean | undefined;
    /**
     * What the status column reads instead of a status, like "3 offices".
     */
    count?: string | undefined;
    /**
     * Whether the row takes a tick, which a part of a path does not.
     */
    selectable?: boolean | undefined;
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
 * Where a row stands, as a word on a pill.
 */
export function ListStatus({ status }: { status: string }) {
    return (
        <span className="k-table__status" data-status={status}>
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
    /**
     * A grip at the start of every row, for a list in an order.
     */
    grips?: boolean | undefined;
}

function Head({ rows, options }: { rows: readonly ListRow[]; options: TableOptions }) {
    const { selection, sort, onSort, label } = options;
    const ticked = rows.filter((row) => selection?.selected.has(row.ref)).length;
    return (
        <thead>
            <tr>
                {options.grips === true ? (
                    <th scope="col" className="k-table__grip">
                        <span className="k-visually-hidden">Order</span>
                    </th>
                ) : null}
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
                            {onSort === undefined || rows.length === 0 || column.sortable === false ? (
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

function Cell({ row, column, options, lead }: { row: TreeRow; column: ListColumn; options: TableOptions; lead?: ReactNode }) {
    if (column.kind === 'title') {
        const name = (
            <span className="k-table__name">
                {row.segment === true ? (
                    <span className="k-table__segment">{row.title}</span>
                ) : (
                    <a className="k-table__link" draggable={false} href={row.href}>
                        {row.title}
                    </a>
                )}
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
            row.count !== undefined ? (
                <span className="k-table__count">{row.count}</span>
            ) : row.status === undefined ? null : (
                <ListStatus status={row.status} />
            )
        ) : column.kind === 'date' ? (
            dateTimeOf(row.updatedAt)
        ) : column.kind === 'person' ? (
            row.updatedBy === undefined ? null : (
                options.nameOf(row.updatedBy)
            )
        ) : (
            columnText(row.values?.[column.key], column.format)
        );
    return <td data-kind={column.kind}>{content}</td>;
}

interface LineProps {
    row: TreeRow;
    title: string;
    options: TableOptions;
    /**
     * Before the title: the tree's indent and its caret.
     */
    lead?: ReactNode;
    depth?: number;
    /**
     * The row's handle, in its own first cell, for a list in an order.
     */
    grip?: ReactNode;
    /**
     * How the row stands while one is moved: lifted with it, faded where it
     * left, or under the pointer to take it in.
     */
    moving?: 'lifted' | 'left' | 'over' | undefined;
    style?: CSSProperties;
    lineRef?: (row: HTMLTableRowElement | null) => void;
}

function Line({ row, title, options, lead, depth, grip, moving, style, lineRef }: LineProps) {
    const { selection } = options;
    const selected = selection?.selected.has(row.ref) === true;
    return (
        <tr
            ref={lineRef}
            className="k-table__row"
            data-selected={selected ? '' : undefined}
            data-over={moving === 'over' ? '' : undefined}
            data-moving={moving === 'lifted' || moving === 'left' ? moving : undefined}
            style={{
                ...(depth === undefined
                    ? {}
                    : ({
                          '--k-depth': depth,
                      } as CSSProperties)),
                ...style,
            }}>
            {options.grips === true ? <td className="k-table__grip">{grip}</td> : null}
            {selection === undefined ? null : (
                <td className="k-table__select">
                    {row.selectable === false ? null : (
                        <Tick
                            label={`Select ${title}`}
                            checked={selected}
                            onChange={(checked) => selection.onChange(toggled(selection.selected, [row.ref], checked))}
                        />
                    )}
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
 * A row's handle: dragged by the pointer, or lifted with Space and moved
 * with the arrow keys.
 */
function Grip({
    label,
    lifted,
    onPointerDown,
    onKeyDown,
    gripRef,
}: {
    label: string;
    lifted: boolean;
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
    gripRef?: (grip: HTMLButtonElement | null) => void;
}) {
    return (
        <button
            ref={gripRef}
            type="button"
            className="k-array__grip"
            aria-label={`Move ${label}. Drag, or press Space and use the arrow keys.`}
            aria-pressed={lifted}
            onPointerDown={onPointerDown}
            onKeyDown={onKeyDown}>
            <GripVertical {...ICON} />
        </button>
    );
}

/**
 * What a screen reader hears after each step of a move, read from a region
 * no one sees.
 */
function Announcer({ text }: { text: string }) {
    return (
        <span className="k-visually-hidden" aria-live="assertive">
            {text}
        </span>
    );
}

/**
 * How far the others move aside while one row is dragged.
 */
interface RowDrag {
    from: number;
    to: number;
    offset: number;
    step: number;
}

const shiftOf = (index: number, drag: RowDrag | undefined): number => {
    if (drag === undefined) return 0;
    if (index === drag.from) return drag.offset;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step;
    return 0;
};

/**
 * Moves a row to `to`, for the order the rows show in while one is lifted.
 */
const moved = <Item,>(items: readonly Item[], from: number, to: number): Item[] => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    return next;
};

/**
 * Rows in the order given, each opening its item from the title. With
 * `onMove`, each row has a grip: drag it, and the rows it passes slide aside
 * to show where it lands, or press Space, the arrow keys, and Space again.
 */
export function FlatRows({
    rows,
    options,
    onMove,
}: {
    rows: readonly TreeRow[];
    options: TableOptions;
    /**
     * Saves the row at `from` where the row at `to` stood.
     */
    onMove?: ((from: number, to: number) => void) | undefined;
}) {
    const [drag, setDrag] = useState<RowDrag | undefined>();
    const [lifted, setLifted] = useState<{ from: number; to: number } | undefined>();
    const [said, setSaid] = useState('');
    const lines = useRef<Array<HTMLTableRowElement | null>>([]);
    const grips = useRef<Array<HTMLButtonElement | null>>([]);
    const latestMove = useRef(onMove);
    latestMove.current = onMove;
    const ordered = onMove !== undefined;
    const tableOptions: TableOptions = {
        ...options,
        grips: ordered,
    };

    const startDrag = (index: number, event: ReactPointerEvent<HTMLButtonElement>): void => {
        if (event.button !== 0 || lifted !== undefined) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        const boxes = lines.current.map((line) => line?.getBoundingClientRect());
        const own = boxes[index];
        if (own === undefined) return;
        const startY = event.clientY;
        let current: RowDrag = {
            from: index,
            to: index,
            offset: 0,
            step: own.height,
        };
        setDrag(current);
        const move = (pointer: PointerEvent): void => {
            const offset = pointer.clientY - startY;
            const centre = own.top + own.height / 2 + offset;
            let to = index;
            boxes.forEach((box, at) => {
                if (box === undefined || at === index) return;
                const middle = box.top + box.height / 2;
                if (at > index && centre > middle) to = Math.max(to, at);
                if (at < index && centre < middle) to = Math.min(to, at);
            });
            current = {
                ...current,
                offset,
                to,
            };
            setDrag(current);
        };
        const end = (): void => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            setDrag(undefined);
            if (current.to !== current.from) latestMove.current?.(current.from, current.to);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    const placeText = (title: string, to: number): string => `${title}, ${to + 1} of ${rows.length}`;

    const keyMove = (index: number, event: ReactKeyboardEvent<HTMLButtonElement>): void => {
        const title = rows[index]!.title;
        if (lifted === undefined) {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            setLifted({
                from: index,
                to: index,
            });
            setSaid(`${placeText(title, index)}. Lifted.`);
            return;
        }
        const liftedTitle = rows[lifted.from]!.title;
        if (event.key === 'Escape') {
            event.preventDefault();
            setLifted(undefined);
            setSaid(`${placeText(liftedTitle, lifted.from)}. Put back.`);
            window.requestAnimationFrame(() => grips.current[lifted.from]?.focus());
            return;
        }
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            setLifted(undefined);
            setSaid(`${placeText(liftedTitle, lifted.to)}. Dropped.`);
            if (lifted.to !== lifted.from) latestMove.current?.(lifted.from, lifted.to);
            return;
        }
        const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
        if (step === 0) return;
        event.preventDefault();
        const to = Math.min(Math.max(lifted.to + step, 0), rows.length - 1);
        setLifted({
            ...lifted,
            to,
        });
        setSaid(placeText(liftedTitle, to));
        // Moving the row in the table takes the focus from its grip, so it goes back.
        window.requestAnimationFrame(() => grips.current[lifted.from]?.focus());
    };

    const shown =
        lifted === undefined
            ? rows.map((row, index) => ({ row, index }))
            : moved(
                  rows.map((row, index) => ({ row, index })),
                  lifted.from,
                  lifted.to
              );
    return (
        <Table rows={rows} options={tableOptions}>
            {shown.map(({ row, index }, position) => {
                const isLifted = lifted?.from === index;
                return (
                    <Line
                        key={row.ref}
                        row={
                            isLifted
                                ? {
                                      ...row,
                                      detail: `${position + 1} of ${rows.length}`,
                                  }
                                : row
                        }
                        title={row.title}
                        options={tableOptions}
                        moving={isLifted || drag?.from === index ? 'lifted' : undefined}
                        style={
                            drag === undefined
                                ? undefined
                                : {
                                      transform: `translateY(${shiftOf(index, drag)}px)`,
                                  }
                        }
                        lineRef={(line) => {
                            lines.current[position] = line;
                        }}
                        grip={
                            ordered ? (
                                <Grip
                                    label={row.title}
                                    lifted={isLifted}
                                    gripRef={(grip) => {
                                        grips.current[index] = grip;
                                    }}
                                    onPointerDown={(event) => startDrag(index, event)}
                                    onKeyDown={(event) => keyMove(lifted?.from ?? index, event)}
                                />
                            ) : undefined
                        }
                    />
                );
            })}
            {ordered ? (
                <tr hidden>
                    <td>
                        <Announcer text={said} />
                    </td>
                </tr>
            ) : null}
        </Table>
    );
}

/**
 * Where a drop in a tree lands: between two lines at a level, or onto a line,
 * under it.
 */
type TreeTarget =
    | {
          kind: 'slot';
          slot: number;
          level: number;
      }
    | {
          kind: 'onto';
          id: string;
      };

/**
 * Rows nested under their parents, each opening and closing on its caret, or
 * with `folds` off, always open. With `onPlace`, each row has a grip: drag it
 * onto another row to put it under that one, or between two rows, where how
 * far left or right it is held picks the level. Space lifts it from the
 * keyboard, the arrow keys move it, Left and Right change its level, and
 * Space drops it.
 */
export function TreeRows({
    rows,
    options,
    folds = true,
    orderable = false,
    depth,
    onPlace,
}: {
    rows: readonly TreeRow[];
    options: TableOptions;
    folds?: boolean;
    /**
     * Whether siblings keep an order of their own, so a drop between two rows
     * lands right there.
     */
    orderable?: boolean;
    /**
     * How many levels the tree may have.
     */
    depth?: number | undefined;
    onPlace?: ((place: TreePlace, body: PlaceBody) => void) | undefined;
}) {
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [dragged, setDragged] = useState<string | undefined>();
    const [target, setTarget] = useState<TreeTarget | undefined>();
    const [keyboard, setKeyboard] = useState(false);
    const [pointer, setPointer] = useState<{ x: number; y: number } | undefined>();
    const [said, setSaid] = useState('');
    const wrapper = useRef<HTMLDivElement | null>(null);
    const lineRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());
    const grips = useRef<Map<string, HTMLButtonElement>>(new Map());
    const lines = useMemo(() => treeLinesOf(rows, folds ? collapsed : new Set()), [rows, collapsed, folds]);
    const spots = useMemo(
        () =>
            lines.map((line) => ({
                id: line.row.tree!.id,
                parent: line.row.tree!.parent,
                depth: line.depth,
            })),
        [lines]
    );
    const placeOf = (id: string): TreePlace => lines.find((line) => line.row.tree!.id === id)!.row.tree!;
    const labelOf = (id: string | null): string => (id === null ? '' : placeOf(id).label);
    const ordered = onPlace !== undefined;
    const tableOptions: TableOptions = {
        ...options,
        grips: ordered,
    };

    const remaining = dragged === undefined ? spots : linesWithout(spots, dragged);
    const height = dragged === undefined ? 1 : heightIn(spots, dragged);

    /**
     * The nearest level a slot allows to the one asked for.
     */
    const slotTarget = (slot: number, level: number): TreeTarget | undefined => {
        const levels = levelsAt(remaining, slot, height, depth);
        if (levels === undefined) return undefined;
        return {
            kind: 'slot',
            slot,
            level: Math.min(Math.max(level, levels.min), levels.max),
        };
    };

    const describe = (spot: TreeTarget, id: string): string => {
        const label = labelOf(id);
        if (spot.kind === 'onto') return `${label}, under ${labelOf(spot.id)}, last`;
        const parent = parentAt(remaining, spot.slot, spot.level);
        const { position, count } = placeAmongSiblings(remaining, spot.slot, spot.level);
        return `${label}, ${parent === null ? 'at the top' : `under ${labelOf(parent)}`}, ${position} of ${count}`;
    };

    const drop = (id: string, spot: TreeTarget | undefined): void => {
        if (spot === undefined) return;
        const body = spot.kind === 'onto' ? placeOnto(spot.id, orderable) : placeAtSlot(remaining, spot.slot, spot.level, orderable);
        const place = placeOf(id);
        if (!orderable && (body.parent ?? null) === place.parent) return;
        onPlace?.(place, body);
    };

    const stop = (): void => {
        setDragged(undefined);
        setTarget(undefined);
        setPointer(undefined);
        setKeyboard(false);
    };

    const startDrag = (id: string, event: ReactPointerEvent<HTMLButtonElement>): void => {
        if (event.button !== 0 || keyboard) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        const own = spots.find((spot) => spot.id === id)!;
        const left = linesWithout(spots, id);
        const tall = heightIn(spots, id);
        const boxes = left.map((spot) => ({
            spot,
            box: lineRefs.current.get(spot.id)?.getBoundingClientRect(),
        }));
        const startX = event.clientX;
        let current: TreeTarget | undefined;
        setDragged(id);
        const move = (moved: PointerEvent): void => {
            setPointer({
                x: moved.clientX,
                y: moved.clientY,
            });
            const level = own.depth + Math.round((moved.clientX - startX) / 20);
            current = undefined;
            for (const [index, { spot, box }] of boxes.entries()) {
                if (box === undefined || moved.clientY < box.top || moved.clientY > box.bottom) continue;
                const within = (moved.clientY - box.top) / box.height;
                const fits = depth === undefined || spot.depth + 1 + tall <= depth;
                if (within > 0.3 && within < 0.7 && fits) {
                    current = {
                        kind: 'onto',
                        id: spot.id,
                    };
                } else {
                    const slot = within <= 0.5 ? index : index + 1;
                    const levels = levelsAt(left, slot, tall, depth);
                    current =
                        levels === undefined
                            ? undefined
                            : {
                                  kind: 'slot',
                                  slot,
                                  level: Math.min(Math.max(level, levels.min), levels.max),
                              };
                }
                break;
            }
            if (current === undefined && boxes.length > 0) {
                const last = boxes[boxes.length - 1]!.box;
                if (last !== undefined && moved.clientY > last.bottom) {
                    const levels = levelsAt(left, boxes.length, tall, depth);
                    if (levels !== undefined) {
                        current = {
                            kind: 'slot',
                            slot: boxes.length,
                            level: Math.min(Math.max(level, levels.min), levels.max),
                        };
                    }
                }
            }
            setTarget(current);
        };
        const end = (): void => {
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            const landed = current;
            stop();
            if (landed !== undefined) drop(id, landed);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    const keyMove = (id: string, event: ReactKeyboardEvent<HTMLButtonElement>): void => {
        if (!keyboard) {
            if (event.key !== ' ' && event.key !== 'Enter') return;
            event.preventDefault();
            const own = spots.find((spot) => spot.id === id)!;
            const left = linesWithout(spots, id);
            const slot = spots.findIndex((spot) => spot.id === id);
            const start: TreeTarget = {
                kind: 'slot',
                slot,
                level: own.depth,
            };
            setDragged(id);
            setKeyboard(true);
            setTarget(start);
            const parent = parentAt(left, slot, own.depth);
            const { position, count } = placeAmongSiblings(left, slot, own.depth);
            setSaid(`${labelOf(id)}, ${parent === null ? 'at the top' : `under ${labelOf(parent)}`}, ${position} of ${count}. Lifted.`);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            setSaid(`${labelOf(id)}. Put back.`);
            stop();
            window.requestAnimationFrame(() => grips.current.get(id)?.focus());
            return;
        }
        if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            const landed = target;
            setSaid(landed === undefined ? `${labelOf(id)}. Put back.` : `${describe(landed, id)}. Dropped.`);
            stop();
            drop(id, landed);
            window.requestAnimationFrame(() => grips.current.get(id)?.focus());
            return;
        }
        if (target === undefined || target.kind !== 'slot') return;
        let next: TreeTarget | undefined;
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const step = event.key === 'ArrowUp' ? -1 : 1;
            for (let slot = target.slot + step; slot >= 0 && slot <= remaining.length && next === undefined; slot += step) {
                next = slotTarget(slot, target.level);
            }
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            next = slotTarget(target.slot, target.level + (event.key === 'ArrowLeft' ? -1 : 1));
        } else {
            return;
        }
        event.preventDefault();
        if (next === undefined) return;
        setTarget(next);
        setSaid(describe(next, id));
    };

    // Where the line between rows sits, in the wrapper, while a drop would land there.
    const lineBox = (): { top: number; left: number } | undefined => {
        if (target === undefined || target.kind !== 'slot' || wrapper.current === null) return undefined;
        const outer = wrapper.current.getBoundingClientRect();
        const above = remaining[target.slot - 1];
        const below = remaining[target.slot];
        const anchor = lineRefs.current.get(below?.id ?? above?.id ?? '');
        if (anchor === undefined) return undefined;
        const box = anchor.getBoundingClientRect();
        const title = anchor.querySelector('.k-table__tree')?.getBoundingClientRect();
        const base = title?.left ?? box.left;
        return {
            top: (below === undefined ? box.bottom : box.top) - outer.top,
            left: base - outer.left + target.level * 20 + 28,
        };
    };
    const line = lineBox();

    return (
        <div className="k-table__moving" ref={wrapper}>
            <Table rows={lines.map((each) => each.row)} options={tableOptions}>
                {lines.map((each) => {
                    const place = each.row.tree!;
                    const under = dragged !== undefined && !remaining.some((spot) => spot.id === place.id);
                    return (
                        <Line
                            key={each.row.ref}
                            row={{
                                ...each.row,
                                title: place.label,
                            }}
                            title={place.label}
                            options={tableOptions}
                            depth={each.depth}
                            moving={target?.kind === 'onto' && target.id === place.id ? 'over' : under ? 'left' : undefined}
                            lineRef={(row) => {
                                if (row === null) lineRefs.current.delete(place.id);
                                else lineRefs.current.set(place.id, row);
                            }}
                            lead={
                                !folds ? (
                                    <span className="k-table__indent" aria-hidden="true" />
                                ) : each.hasChildren ? (
                                    <button
                                        type="button"
                                        className="k-icon-button k-table__caret"
                                        aria-expanded={each.expanded}
                                        aria-label={
                                            each.expanded ? `Hide what is under ${place.label}` : `Show what is under ${place.label}`
                                        }
                                        onClick={() => {
                                            const next = new Set(collapsed);
                                            if (each.expanded) next.add(place.id);
                                            else next.delete(place.id);
                                            setCollapsed(next);
                                        }}>
                                        {each.expanded ? <ChevronDown {...ICON} /> : <ChevronRight {...ICON} />}
                                    </button>
                                ) : (
                                    <span className="k-table__caret" aria-hidden="true" />
                                )
                            }
                            grip={
                                ordered ? (
                                    <Grip
                                        label={place.label}
                                        lifted={keyboard && dragged === place.id}
                                        gripRef={(grip) => {
                                            if (grip === null) grips.current.delete(place.id);
                                            else grips.current.set(place.id, grip);
                                        }}
                                        onPointerDown={(event) => startDrag(place.id, event)}
                                        onKeyDown={(event) => keyMove(place.id, event)}
                                    />
                                ) : undefined
                            }
                        />
                    );
                })}
            </Table>
            {line === undefined ? null : (
                <div
                    className="k-table__drop-line"
                    aria-hidden="true"
                    style={{
                        top: line.top,
                        left: line.left,
                    }}
                />
            )}
            {pointer === undefined || dragged === undefined ? null : (
                <div
                    className="k-table__ghost"
                    aria-hidden="true"
                    style={{
                        left: pointer.x + 14,
                        top: pointer.y + 10,
                    }}>
                    <GripVertical {...ICON} />
                    {labelOf(dragged)}
                </div>
            )}
            {ordered ? <Announcer text={said} /> : null}
        </div>
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
