import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { Combobox } from '@base-ui/react/combobox';
import { Dialog } from '@base-ui/react/dialog';
import { NumberField } from '@base-ui/react/number-field';
import { Select } from '@base-ui/react/select';
import { Switch } from '@base-ui/react/switch';
import { Menu } from '@base-ui/react/menu';
import {
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsUpDown,
    Ellipsis,
    GripVertical,
    Lock,
    LockOpen,
    Pencil,
    Plus,
    Search,
    X,
} from 'lucide-react';
import { indexLabelOf, movedIndex, remapOpen, rowLabelsOf, singularOf } from './array-rows.js';
import { ICON, useEditorContext } from './context.js';
import { Hint } from './hint.js';
import { MediaPicker, type MediaRecord } from './media.js';
import { emptyFor, humanize, isImage, isRichText, resolveRef, typeOf, type JsonSchema } from './schema.js';
import { RichTextControl } from './rich-text.js';
import { isSeo, SeoControl } from './seo.js';
import { stringInputOf } from './string-input.js';

export interface ControlProps {
    schema: JsonSchema;
    root: JsonSchema;
    value: unknown;
    onChange: (value: unknown) => void;
    disabled: boolean;
    brand?: string;
    searchTool?: string;
    /**
     * What editors see for each value of an enum.
     */
    labels?: Record<string, string>;
    required?: boolean;
    id?: string;
    /**
     * The property or field's own name, which a field called `slug` locks
     * behind Unlock.
     */
    name?: string;
    /**
     * What the field is called, which a list's Add button names one item
     * after.
     */
    label?: string;
    /**
     * The field's label, drawn by a list whose items fold, so Collapse all and
     * Expand all sit beside it.
     */
    heading?: ReactNode;
}

function SelectControl(props: {
    options: string[];
    labels?: Record<string, string>;
    value: string;
    onChange: (value: unknown) => void;
    disabled: boolean;
    required?: boolean;
    id?: string;
}) {
    const items = props.options.map((option) => ({
        label: props.labels?.[option] ?? option,
        value: option,
    }));
    return (
        <Select.Root
            items={items}
            value={props.value === '' ? null : props.value}
            onValueChange={(next) => props.onChange(next === null ? (props.required === true ? '' : undefined) : next)}
            disabled={props.disabled}>
            <Select.Trigger className="k-input k-select" id={props.id}>
                <Select.Value placeholder="Choose" />
                <Select.Icon className="k-select__icon">
                    <ChevronsUpDown {...ICON} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu">
                        {items.map((item) => (
                            <Select.Item key={item.value} value={item.value} className="k-menu__item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu__check">
                                    <Check {...ICON} />
                                </Select.ItemIndicator>
                            </Select.Item>
                        ))}
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}

/**
 * A stored instant as the local date and time a `datetime-local` input shows,
 * which reads its value as local time.
 */
const localDateTime = (iso: string): string => {
    const date = new Date(iso);
    if (iso === '' || Number.isNaN(date.getTime())) return '';
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 16);
};

/**
 * A slug, shown muted and locked until the person unlocks it, since changing
 * one moves the page it names.
 */
function SlugControl({ value, onChange, disabled, required, id }: ControlProps) {
    const text = typeof value === 'string' ? value : '';
    const [locked, setLocked] = useState(text !== '');
    return (
        <div className="k-slug" data-locked={locked}>
            <input
                id={id}
                className="k-input k-slug__input"
                type="text"
                value={text}
                disabled={disabled}
                readOnly={locked}
                onChange={(event) => onChange(event.target.value === '' && required !== true ? undefined : event.target.value)}
            />
            {disabled ? null : (
                <button type="button" className="k-text-button k-slug__toggle" onClick={() => setLocked(!locked)}>
                    {locked ? <LockOpen {...ICON} /> : <Lock {...ICON} />}
                    {locked ? 'Unlock' : 'Lock'}
                </button>
            )}
        </div>
    );
}

function StringControl(props: ControlProps) {
    const { schema, labels, value, onChange, disabled, required, id } = props;
    const text = typeof value === 'string' ? value : '';
    const set = (next: string): void => onChange(next === '' && required !== true ? undefined : next);
    if (schema.enum !== undefined) {
        return (
            <SelectControl
                options={schema.enum.map(String)}
                labels={labels}
                value={text}
                onChange={onChange}
                disabled={disabled}
                required={required}
                id={id}
            />
        );
    }
    if (schema.format === 'uri') {
        return (
            <input
                id={id}
                className="k-input"
                type="url"
                value={text}
                disabled={disabled}
                placeholder={schema.pattern?.includes('https') === true ? 'https://' : 'https:// or http://'}
                onChange={(event) => set(event.target.value)}
            />
        );
    }
    if (schema.format === 'date') {
        return (
            <input id={id} className="k-input" type="date" value={text} disabled={disabled} onChange={(event) => set(event.target.value)} />
        );
    }
    if (schema.format === 'date-time') {
        return (
            <input
                id={id}
                className="k-input"
                type="datetime-local"
                value={localDateTime(text)}
                disabled={disabled}
                onChange={(event) => set(event.target.value === '' ? '' : new Date(event.target.value).toISOString())}
            />
        );
    }
    const input = stringInputOf(schema);
    if (props.name === 'slug' && input === 'text') return <SlugControl {...props} />;
    const over = schema.maxLength !== undefined && text.length > schema.maxLength;
    return (
        <div className="k-text-field">
            {input === 'textarea' ? (
                <textarea
                    id={id}
                    className="k-input k-textarea"
                    value={text}
                    disabled={disabled}
                    rows={3}
                    onChange={(event) => set(event.target.value)}
                />
            ) : (
                <input
                    id={id}
                    className="k-input"
                    type={input}
                    value={text}
                    disabled={disabled}
                    onChange={(event) => set(event.target.value)}
                />
            )}
            {schema.maxLength !== undefined ? (
                <span className="k-counter" data-over={over}>
                    {text.length}/{schema.maxLength}
                </span>
            ) : null}
        </div>
    );
}

function NumberControl({ schema, value, onChange, disabled, id }: ControlProps) {
    return (
        <NumberField.Root
            value={typeof value === 'number' ? value : null}
            onValueChange={(next) => onChange(next ?? undefined)}
            min={schema.minimum}
            max={schema.maximum}
            step={typeOf(schema) === 'integer' ? 1 : undefined}
            disabled={disabled}>
            <NumberField.Group>
                <NumberField.Input className="k-input" id={id} />
            </NumberField.Group>
        </NumberField.Root>
    );
}

function BooleanControl({ value, onChange, disabled, id }: ControlProps) {
    return (
        <Switch.Root
            className="k-switch"
            id={id}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked)}
            disabled={disabled}>
            <Switch.Thumb className="k-switch__thumb" />
        </Switch.Root>
    );
}

interface SearchResult {
    id: string;
    label: string;
    image?: string;
}

/**
 * An id from a collection or a relationship, picked from what its search
 * answers.
 */
function ReferenceControl({ value, onChange, brand, disabled, id }: ControlProps) {
    const { connection, resolveUrl } = useEditorContext();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [chosen, setChosen] = useState<SearchResult | undefined>();
    const current = typeof value === 'string' ? value : '';

    const search = useCallback(
        async (input: { q?: string; ids?: string[] }) => {
            if (brand === undefined) return [];
            const answer = await connection.call<{ items: SearchResult[] }>('editing_search_items', {
                params: {
                    brand,
                },
                query: input,
            });
            return answer.status === 200 ? answer.body.items : [];
        },
        [connection, brand]
    );

    useEffect(() => {
        if (current === '') {
            setChosen(undefined);
            return;
        }
        void search({
            ids: [current],
        }).then((items) => setChosen(items[0]));
    }, [current, search]);

    useEffect(() => {
        if (!open) return;
        const timer = window.setTimeout(() => {
            void search({
                q: query,
            }).then(setResults);
        }, 150);
        return () => window.clearTimeout(timer);
    }, [open, query, search]);

    return (
        <Combobox.Root
            items={results}
            filter={null}
            autoHighlight
            value={chosen ?? null}
            onValueChange={(next) => {
                if (next !== null) onChange(next.id);
            }}
            itemToStringLabel={(result) => result.label}
            isItemEqualToValue={(result, picked) => result.id === picked.id}
            inputValue={query}
            onInputValueChange={(next) => setQuery(next)}
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) setQuery('');
            }}
            disabled={disabled}>
            <Combobox.Trigger className="k-input k-select" id={id}>
                <span className="k-select__value">
                    {chosen?.image !== undefined ? <img className="k-thumb" src={resolveUrl(chosen.image)} alt="" /> : null}
                    {chosen?.label ?? (current === '' ? <span className="k-placeholder">Choose</span> : current)}
                </span>
                <ChevronsUpDown {...ICON} className="k-select__icon" />
            </Combobox.Trigger>
            <Combobox.Portal>
                <Combobox.Positioner sideOffset={6} align="start" className="k-positioner">
                    <Combobox.Popup className="k-popup k-picker">
                        <label className="k-picker__search">
                            <Search {...ICON} />
                            <Combobox.Input placeholder="Search" aria-label="Search" />
                        </label>
                        <Combobox.Empty>
                            <p className="k-help">Nothing found</p>
                        </Combobox.Empty>
                        <Combobox.List className="k-picker__list">
                            {(result: SearchResult) => (
                                <Combobox.Item key={result.id} value={result} className="k-menu__item">
                                    {result.image !== undefined ? <img className="k-thumb" src={resolveUrl(result.image)} alt="" /> : null}
                                    <span className="k-ellipsis">{result.label}</span>
                                    <Combobox.ItemIndicator className="k-menu__check">
                                        <Check {...ICON} />
                                    </Combobox.ItemIndicator>
                                </Combobox.Item>
                            )}
                        </Combobox.List>
                    </Combobox.Popup>
                </Combobox.Positioner>
            </Combobox.Portal>
        </Combobox.Root>
    );
}

interface ImageRef {
    id?: string;
    alt?: string;
    crop?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    focalPoint?: {
        x: number;
        y: number;
    };
}

const CROP_EDGES: Array<{ key: keyof NonNullable<ImageRef['crop']>; label: string }> = [
    {
        key: 'x',
        label: 'X',
    },
    {
        key: 'y',
        label: 'Y',
    },
    {
        key: 'width',
        label: 'W',
    },
    {
        key: 'height',
        label: 'H',
    },
];

/**
 * An image as one compact row: a thumbnail, its alt text or file name, and
 * buttons to edit or remove it. Edit opens a sheet with the image at size,
 * where a click sets the focal point, with Replace, its alt text and its crop.
 */
function ImageControl({ value, onChange, disabled }: ControlProps) {
    const { connection, resolveUrl } = useEditorContext();
    const image = (value ?? {}) as ImageRef;
    const [record, setRecord] = useState<MediaRecord | undefined>();
    const [editing, setEditing] = useState(false);
    useEffect(() => {
        if (image.id === undefined) {
            setRecord(undefined);
            return;
        }
        void connection
            .call<MediaRecord>('editing_media_get', {
                params: {
                    id: image.id,
                },
            })
            .then((answer) => {
                if (answer.status === 200) setRecord(answer.body);
            });
    }, [connection, image.id]);
    const set = (patch: Partial<ImageRef>): void =>
        onChange({
            ...image,
            alt: image.alt ?? '',
            ...patch,
        });
    const pick = (picked: MediaRecord): void =>
        set({
            id: picked.id,
            alt: image.alt === undefined || image.alt === '' ? (picked.alt ?? '') : image.alt,
            crop: undefined,
            focalPoint: undefined,
        });

    if (image.id === undefined) return <MediaPicker current={undefined} disabled={disabled} onPick={pick} />;

    const source = record === undefined ? undefined : resolveUrl(record.url);
    const title = image.alt === undefined || image.alt === '' ? (record?.filename ?? 'Image') : image.alt;
    return (
        <div className="k-image">
            {record === undefined ? (
                <span className="k-image__thumb" aria-hidden="true" />
            ) : (
                <img className="k-image__thumb" src={resolveUrl(`${record.url}?w=120`)} alt="" />
            )}
            <span className="k-image__name">
                <span className="k-image__title">{title}</span>
                {record === undefined ? null : (
                    <span className="k-image__size">
                        {record.width} × {record.height}
                    </span>
                )}
            </span>
            <span className="k-image__buttons">
                <Dialog.Root open={editing} onOpenChange={setEditing}>
                    <Hint label="Edit image">
                        <Dialog.Trigger className="k-icon-button" aria-label="Edit image">
                            <Pencil {...ICON} />
                        </Dialog.Trigger>
                    </Hint>
                    <Dialog.Portal>
                        <Dialog.Backdrop className="k-backdrop" />
                        <Dialog.Popup className="k-sheet">
                            <div className="k-sheet__head">
                                <Dialog.Title className="k-dialog__title k-ellipsis">{record?.filename ?? 'Image'}</Dialog.Title>
                                <Dialog.Close className="k-icon-button" aria-label="Close">
                                    <X {...ICON} />
                                </Dialog.Close>
                            </div>
                            {source === undefined ? null : (
                                <div className="k-image-frame">
                                    <img
                                        src={source}
                                        alt=""
                                        data-editable={!disabled}
                                        onClick={(event) => {
                                            if (disabled) return;
                                            const rect = event.currentTarget.getBoundingClientRect();
                                            set({
                                                focalPoint: {
                                                    x: Math.round(((event.clientX - rect.left) / rect.width) * 100) / 100,
                                                    y: Math.round(((event.clientY - rect.top) / rect.height) * 100) / 100,
                                                },
                                            });
                                        }}
                                    />
                                    {image.focalPoint !== undefined ? (
                                        <span
                                            className="k-image-frame__focal"
                                            style={{
                                                left: `${image.focalPoint.x * 100}%`,
                                                top: `${image.focalPoint.y * 100}%`,
                                            }}
                                        />
                                    ) : null}
                                </div>
                            )}
                            {disabled ? null : (
                                <div className="k-sheet__actions">
                                    <MediaPicker current={image.id} disabled={disabled} onPick={pick} />
                                    <span className="k-help">Click the image to set its focus.</span>
                                </div>
                            )}
                            <label className="k-sheet__field">
                                <span className="k-sheet__label">Alt text</span>
                                <input
                                    className="k-input"
                                    type="text"
                                    value={image.alt ?? ''}
                                    disabled={disabled}
                                    placeholder="What the image shows"
                                    onChange={(event) =>
                                        set({
                                            alt: event.target.value,
                                        })
                                    }
                                />
                            </label>
                            {disabled ? null : (
                                <Collapsible.Root className="k-collapsible">
                                    <Collapsible.Trigger className="k-collapsible__trigger">
                                        <ChevronRight {...ICON} />
                                        Crop
                                    </Collapsible.Trigger>
                                    <Collapsible.Panel className="k-collapsible__panel">
                                        <div className="k-crop">
                                            {CROP_EDGES.map((edge) => (
                                                <NumberField.Root
                                                    key={edge.key}
                                                    value={
                                                        image.crop?.[edge.key] ?? (edge.key === 'width' || edge.key === 'height' ? 1 : 0)
                                                    }
                                                    min={0}
                                                    max={1}
                                                    step={0.01}
                                                    onValueChange={(next) =>
                                                        set({
                                                            crop: {
                                                                x: 0,
                                                                y: 0,
                                                                width: 1,
                                                                height: 1,
                                                                ...image.crop,
                                                                [edge.key]: next ?? 0,
                                                            },
                                                        })
                                                    }>
                                                    <NumberField.Group className="k-crop__edge">
                                                        <span className="k-sheet__label" aria-hidden="true">
                                                            {edge.label}
                                                        </span>
                                                        <NumberField.Input className="k-input" aria-label={`Crop ${edge.key}`} />
                                                    </NumberField.Group>
                                                </NumberField.Root>
                                            ))}
                                        </div>
                                    </Collapsible.Panel>
                                </Collapsible.Root>
                            )}
                        </Dialog.Popup>
                    </Dialog.Portal>
                </Dialog.Root>
                {disabled ? null : (
                    <Hint label="Remove image">
                        <button type="button" className="k-icon-button" aria-label="Remove image" onClick={() => onChange(undefined)}>
                            <X {...ICON} />
                        </button>
                    </Hint>
                )}
            </span>
        </div>
    );
}

const moveItem = (items: unknown[], from: number, to: number): unknown[] => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

interface Drag {
    from: number;
    to: number;
    offset: number;
    /**
     * How far the others move aside: the dragged item's height and the gap.
     */
    step: number;
}

/**
 * Where an item sits while another is dragged: the dragged one follows the
 * pointer, and the ones it passed move aside to show where it will land.
 */
const shiftFor = (index: number, drag: Drag | undefined): number => {
    if (drag === undefined) return 0;
    if (index === drag.from) return drag.offset;
    if (drag.from < drag.to && index > drag.from && index <= drag.to) return -drag.step;
    if (drag.to < drag.from && index >= drag.to && index < drag.from) return drag.step;
    return 0;
};

/**
 * Whether a list's items are objects too large for one row, so each one folds
 * to a row of its own with its fields under it.
 */
export const foldsItems = (schema: JsonSchema, root: JsonSchema): boolean => {
    const resolved = resolveRef(schema, root);
    if (isRichText(schema) || isRichText(resolved) || typeOf(resolved) !== 'array') return false;
    const itemSchema = resolved.items ?? {};
    const item = resolveRef(itemSchema, root);
    return typeOf(item) === 'object' && !isImage(itemSchema, root) && !isRichText(item) && !isSeo(item) && !fitsOneRow(item, root);
};

/**
 * Follows the pointer while an item is dragged by its handle, moving the
 * others aside, and hands back where it landed.
 */
const useDrag = (disabled: boolean, onDrop: (from: number, to: number) => void) => {
    const [drag, setDrag] = useState<Drag | undefined>();
    const rows = useRef<Array<HTMLElement | null>>([]);
    const latestDrop = useRef(onDrop);
    latestDrop.current = onDrop;

    const startDrag = (index: number, event: React.PointerEvent<HTMLButtonElement>): void => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        const boxes = rows.current.map((row) => row?.getBoundingClientRect());
        const own = boxes[index];
        if (own === undefined) return;
        const list = rows.current[index]?.parentElement;
        const gap = list === null || list === undefined ? 0 : Number.parseFloat(window.getComputedStyle(list).rowGap) || 0;
        const startY = event.clientY;
        let current: Drag = {
            from: index,
            to: index,
            offset: 0,
            step: own.height + gap,
        };
        setDrag(current);
        const move = (moved: PointerEvent): void => {
            const offset = moved.clientY - startY;
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
            if (current.to !== current.from) latestDrop.current(current.from, current.to);
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    return {
        drag,
        rows,
        startDrag,
    };
};

function ArrayControl(props: ControlProps) {
    const { schema, root, value, onChange, disabled } = props;
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? {};
    const resolvedItem = resolveRef(itemSchema, root);
    const oneRow = typeOf(resolvedItem) === 'object' && fitsOneRow(resolvedItem, root);
    const folds = foldsItems(schema, root);
    const max = schema.maxItems;
    const min = schema.minItems ?? 0;
    const singular = singularOf(props.label ?? 'Item');
    // Editors like rich text read their value once, so a move or a removal remounts every item.
    const [generation, setGeneration] = useState(0);
    const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
    const reorder = (next: unknown[], remap: (index: number) => number | undefined): void => {
        setGeneration((current) => current + 1);
        setOpen((previous) => remapOpen(previous, remap));
        onChange(next);
    };
    const moveTo = (from: number, to: number): void => reorder(moveItem(items, from, to), (index) => movedIndex(index, from, to));
    const remove = (at: number): void =>
        reorder(
            items.filter((_, index) => index !== at),
            (index) => (index === at ? undefined : index > at ? index - 1 : index)
        );
    const duplicate = (at: number): void => {
        reorder([...items.slice(0, at + 1), structuredClone(items[at]), ...items.slice(at + 1)], (index) =>
            index > at ? index + 1 : index
        );
        setOpen((previous) => new Set([...previous, at + 1]));
    };
    const add = (): void => {
        onChange([...items, emptyFor(itemSchema, root)]);
        if (folds) setOpen((previous) => new Set([...previous, items.length]));
    };
    const { drag, rows, startDrag } = useDrag(disabled, moveTo);

    const keyMove = (index: number, event: React.KeyboardEvent<HTMLButtonElement>): void => {
        const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : undefined;
        if (to === undefined || to < 0 || to >= items.length) return;
        event.preventDefault();
        moveTo(index, to);
        window.requestAnimationFrame(() => rows.current[to]?.querySelector<HTMLButtonElement>('.k-array__grip')?.focus());
    };

    const changeItem = (at: number, next: unknown): void => onChange(items.map((existing, index) => (index === at ? next : existing)));

    const grip = (index: number) =>
        disabled ? null : (
            <button
                type="button"
                className="k-array__grip"
                aria-label={`Move ${singular.toLowerCase()} ${index + 1}. Drag, or use the arrow keys.`}
                onPointerDown={(event) => startDrag(index, event)}
                onKeyDown={(event) => keyMove(index, event)}>
                <GripVertical {...ICON} />
            </button>
        );

    const footer = (
        <div className="k-array__footer">
            {disabled ? (
                <span />
            ) : (
                <button type="button" className="k-text-button" disabled={max !== undefined && items.length >= max} onClick={add}>
                    <Plus {...ICON} />
                    {folds ? `Add ${singular.toLowerCase()}` : 'Add'}
                </button>
            )}
            <span className="k-counter">
                {items.length}
                {max !== undefined ? `/${max}` : ''}
            </span>
        </div>
    );

    if (folds) {
        const allOpen = items.length > 0 && items.every((_, index) => open.has(index));
        return (
            <div className="k-array k-array--folds" data-dragging={drag !== undefined}>
                <div className="k-array__head">
                    {props.heading ?? <span />}
                    {items.length === 0 ? null : (
                        <span className="k-array__toggles">
                            <button type="button" className="k-text-button" disabled={open.size === 0} onClick={() => setOpen(new Set())}>
                                Collapse all
                            </button>
                            <button
                                type="button"
                                className="k-text-button"
                                disabled={allOpen}
                                onClick={() => setOpen(new Set(items.map((_, index) => index)))}>
                                Expand all
                            </button>
                        </span>
                    )}
                </div>
                {items.length === 0 ? null : (
                    <div className="k-array__items">
                        {items.map((item, index) => {
                            const { title, tag } = rowLabelsOf(resolvedItem, root, item);
                            const isOpen = open.has(index);
                            return (
                                <Collapsible.Root
                                    key={`${generation}:${index}`}
                                    ref={(row: HTMLDivElement | null) => {
                                        rows.current[index] = row;
                                    }}
                                    className="k-array__item"
                                    open={isOpen}
                                    onOpenChange={(next) =>
                                        setOpen((previous) => {
                                            const updated = new Set(previous);
                                            if (next) updated.add(index);
                                            else updated.delete(index);
                                            return updated;
                                        })
                                    }
                                    data-dragged={drag?.from === index}
                                    style={{
                                        transform: `translateY(${shiftFor(index, drag)}px)`,
                                    }}>
                                    <div className="k-array__row">
                                        {grip(index)}
                                        <Collapsible.Trigger className="k-array__summary">
                                            <span className="k-array__index">{indexLabelOf(index)}</span>
                                            {tag === undefined ? null : <span className="k-array__tag">{tag}</span>}
                                            <span className="k-array__title" data-empty={title === undefined}>
                                                {title ?? 'Untitled'}
                                            </span>
                                        </Collapsible.Trigger>
                                        {disabled ? null : (
                                            <Menu.Root>
                                                <Menu.Trigger
                                                    className="k-icon-button"
                                                    aria-label={`More for ${singular.toLowerCase()} ${index + 1}`}>
                                                    <Ellipsis {...ICON} />
                                                </Menu.Trigger>
                                                <Menu.Portal>
                                                    <Menu.Positioner sideOffset={4} align="end" className="k-positioner">
                                                        <Menu.Popup className="k-popup k-menu">
                                                            <Menu.Item
                                                                className="k-menu__item"
                                                                disabled={max !== undefined && items.length >= max}
                                                                onClick={() => duplicate(index)}>
                                                                Duplicate
                                                            </Menu.Item>
                                                            <Menu.Item
                                                                className="k-menu__item"
                                                                disabled={index === 0}
                                                                onClick={() => moveTo(index, index - 1)}>
                                                                Move up
                                                            </Menu.Item>
                                                            <Menu.Item
                                                                className="k-menu__item"
                                                                disabled={index === items.length - 1}
                                                                onClick={() => moveTo(index, index + 1)}>
                                                                Move down
                                                            </Menu.Item>
                                                            <Menu.Item
                                                                className="k-menu__item"
                                                                disabled={items.length <= min}
                                                                onClick={() => remove(index)}>
                                                                Remove
                                                            </Menu.Item>
                                                        </Menu.Popup>
                                                    </Menu.Positioner>
                                                </Menu.Portal>
                                            </Menu.Root>
                                        )}
                                        <Collapsible.Trigger
                                            className="k-icon-button k-array__chevron"
                                            aria-label={
                                                isOpen
                                                    ? `Collapse ${singular.toLowerCase()} ${index + 1}`
                                                    : `Expand ${singular.toLowerCase()} ${index + 1}`
                                            }>
                                            <ChevronDown {...ICON} />
                                        </Collapsible.Trigger>
                                    </div>
                                    <Collapsible.Panel keepMounted className="k-array__panel">
                                        <ObjectControl
                                            {...props}
                                            id={undefined}
                                            heading={undefined}
                                            label={undefined}
                                            schema={resolvedItem}
                                            root={root}
                                            value={item}
                                            required
                                            onChange={(next) => changeItem(index, next)}
                                        />
                                    </Collapsible.Panel>
                                </Collapsible.Root>
                            );
                        })}
                    </div>
                )}
                {footer}
            </div>
        );
    }

    return (
        <div className="k-array" data-dragging={drag !== undefined}>
            {items.map((item, index) => (
                <div
                    key={`${generation}:${index}`}
                    ref={(row) => {
                        rows.current[index] = row;
                    }}
                    className="k-array__item"
                    data-one-row={oneRow}
                    data-dragged={drag?.from === index}
                    style={{
                        transform: `translateY(${shiftFor(index, drag)}px)`,
                    }}>
                    {grip(index)}
                    <div className="k-array__body">
                        {oneRow ? (
                            <InlineObjectControl
                                {...props}
                                id={undefined}
                                schema={resolvedItem}
                                root={root}
                                value={item}
                                required
                                onChange={(next) => changeItem(index, next)}
                            />
                        ) : (
                            <Control
                                {...props}
                                id={undefined}
                                name={undefined}
                                label={undefined}
                                heading={undefined}
                                schema={itemSchema}
                                root={root}
                                value={item}
                                required
                                onChange={(next) => changeItem(index, next)}
                            />
                        )}
                    </div>
                    {disabled ? null : (
                        <button
                            type="button"
                            className="k-icon-button"
                            disabled={items.length <= min}
                            onClick={() => remove(index)}
                            aria-label={`Remove item ${index + 1}`}>
                            <X {...ICON} />
                        </button>
                    )}
                </div>
            ))}
            {footer}
        </div>
    );
}

/**
 * The mark a required field's label carries.
 */
export function Required() {
    return (
        <span className="k-required" aria-hidden="true">
            *
        </span>
    );
}

/**
 * A label above its input.
 */
export function Row({ label, htmlFor, required, children }: { label: string; htmlFor?: string; required?: boolean; children: ReactNode }) {
    return (
        <div className="k-row">
            <label className="k-row__label" htmlFor={htmlFor} title={label}>
                {label}
                {required === true ? <Required /> : null}
            </label>
            <div className="k-row__input">{children}</div>
        </div>
    );
}

/**
 * The most properties a list item lays side by side.
 */
const ONE_ROW_PROPERTIES = 4;

/**
 * Whether every property of an object edits on one line, so a list item can
 * lay them side by side.
 */
const fitsOneRow = (schema: JsonSchema, root: JsonSchema): boolean => {
    const properties = Object.values(schema.properties ?? {});
    if (properties.length === 0 || properties.length > ONE_ROW_PROPERTIES) return false;
    return properties.every((property) => {
        const resolved = resolveRef(property, root);
        if (isRichText(property) || isRichText(resolved) || isSeo(property) || isSeo(resolved) || isImage(property, root)) return false;
        const type = typeOf(resolved);
        if (type === 'string') return stringInputOf(resolved) !== 'textarea';
        return type === 'number' || type === 'integer' || type === 'boolean';
    });
};

/**
 * The control for one property of an object, writing the object as a whole.
 */
function PropertyControl({ props, name, property, id }: { props: ControlProps; name: string; property: JsonSchema; id?: string }) {
    const current = (props.value ?? {}) as Record<string, unknown>;
    return (
        <Control
            {...props}
            id={id}
            schema={property}
            brand={undefined}
            searchTool={undefined}
            labels={undefined}
            name={name}
            label={humanize(name)}
            heading={undefined}
            value={current[name]}
            required={props.schema.required?.includes(name)}
            onChange={(next) => {
                const updated = {
                    ...current,
                };
                if (next === undefined) delete updated[name];
                else updated[name] = next;
                props.onChange(updated);
            }}
        />
    );
}

/**
 * An object's properties, a row each, editing the object as a whole.
 */
function ObjectControl(props: ControlProps) {
    const base = useId();
    return (
        <div className="k-fields">
            {Object.entries(props.schema.properties ?? {}).map(([name, property]) => (
                <Row key={name} label={humanize(name)} htmlFor={`${base}-${name}`} required={props.schema.required?.includes(name)}>
                    <PropertyControl props={props} name={name} property={property} id={`${base}-${name}`} />
                </Row>
            ))}
        </div>
    );
}

/**
 * A short object's properties side by side, each with a small label above,
 * for a list item whose properties all edit on one line.
 */
function InlineObjectControl(props: ControlProps) {
    const base = useId();
    return (
        <div className="k-inline-fields">
            {Object.entries(props.schema.properties ?? {}).map(([name, property]) => (
                <div key={name} className="k-inline-fields__field">
                    <label className="k-inline-fields__label" htmlFor={`${base}-${name}`}>
                        {humanize(name)}
                        {props.schema.required?.includes(name) === true ? <Required /> : null}
                    </label>
                    <PropertyControl props={props} name={name} property={property} id={`${base}-${name}`} />
                </div>
            ))}
        </div>
    );
}

/**
 * The input a schema gets.
 */
export function Control(props: ControlProps) {
    const resolved = resolveRef(props.schema, props.root);
    if (isRichText(props.schema) || isRichText(resolved)) return <RichTextControl {...props} schema={resolved} />;
    if (isSeo(props.schema) || isSeo(resolved)) return <SeoControl {...props} schema={resolved} />;
    const brand = props.brand ?? resolved.brand;
    if (isImage(props.schema, props.root)) return <ImageControl {...props} schema={resolved} />;
    if (brand !== undefined && typeOf(resolved) !== 'array') return <ReferenceControl {...props} schema={resolved} brand={brand} />;
    switch (typeOf(resolved)) {
        case 'string':
            return <StringControl {...props} schema={resolved} />;
        case 'number':
        case 'integer':
            return <NumberControl {...props} schema={resolved} />;
        case 'boolean':
            return <BooleanControl {...props} schema={resolved} />;
        case 'array':
            return <ArrayControl {...props} schema={resolved} brand={brand} />;
        case 'object':
            return <ObjectControl {...props} schema={resolved} />;
        default:
            return (
                <div className="k-unsupported">
                    <pre>{JSON.stringify(props.value, null, 2)}</pre>
                    <p className="k-help">Ask the model to change this one.</p>
                </div>
            );
    }
}
