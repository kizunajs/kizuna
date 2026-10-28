import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { Combobox } from '@base-ui/react/combobox';
import { Dialog } from '@base-ui/react/dialog';
import { NumberField } from '@base-ui/react/number-field';
import { Select } from '@base-ui/react/select';
import { Switch } from '@base-ui/react/switch';
import { Check, ChevronRight, ChevronsUpDown, GripVertical, Pencil, Plus, Search, X } from 'lucide-react';
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
                <Select.Icon className="k-select-icon">
                    <ChevronsUpDown {...ICON} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
                <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu">
                        {items.map((item) => (
                            <Select.Item key={item.value} value={item.value} className="k-menu-item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="k-menu-check">
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

function StringControl({ schema, labels, value, onChange, disabled, required, id }: ControlProps) {
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
    const over = schema.maxLength !== undefined && text.length > schema.maxLength;
    return (
        <div className="k-text">
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
            <Switch.Thumb className="k-switch-thumb" />
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
                <span className="k-select-value">
                    {chosen?.image !== undefined ? <img className="k-thumb-small" src={resolveUrl(chosen.image)} alt="" /> : null}
                    {chosen?.label ?? (current === '' ? <span className="k-placeholder">Choose</span> : current)}
                </span>
                <ChevronsUpDown {...ICON} className="k-select-icon" />
            </Combobox.Trigger>
            <Combobox.Portal>
                <Combobox.Positioner sideOffset={6} align="start" className="k-positioner">
                    <Combobox.Popup className="k-popup k-picker">
                        <label className="k-search">
                            <Search {...ICON} />
                            <Combobox.Input placeholder="Search" aria-label="Search" />
                        </label>
                        <Combobox.Empty>
                            <p className="k-help">Nothing found</p>
                        </Combobox.Empty>
                        <Combobox.List className="k-picker-list">
                            {(result: SearchResult) => (
                                <Combobox.Item key={result.id} value={result} className="k-menu-item">
                                    {result.image !== undefined ? (
                                        <img className="k-thumb-small" src={resolveUrl(result.image)} alt="" />
                                    ) : null}
                                    <span className="k-ellipsis">{result.label}</span>
                                    <Combobox.ItemIndicator className="k-menu-check">
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
        <div className="k-image-row">
            {record === undefined ? (
                <span className="k-image-thumb" aria-hidden="true" />
            ) : (
                <img className="k-image-thumb" src={resolveUrl(`${record.url}?w=120`)} alt="" />
            )}
            <span className="k-image-name">
                <span className="k-image-title">{title}</span>
                {record === undefined ? null : (
                    <span className="k-image-size">
                        {record.width} × {record.height}
                    </span>
                )}
            </span>
            <span className="k-image-buttons">
                <Dialog.Root open={editing} onOpenChange={setEditing}>
                    <Hint label="Edit image">
                        <Dialog.Trigger className="k-icon-button" aria-label="Edit image">
                            <Pencil {...ICON} />
                        </Dialog.Trigger>
                    </Hint>
                    <Dialog.Portal>
                        <Dialog.Backdrop className="k-backdrop" />
                        <Dialog.Popup className="k-sheet">
                            <div className="k-sheet-head">
                                <Dialog.Title className="k-dialog-title k-ellipsis">{record?.filename ?? 'Image'}</Dialog.Title>
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
                                            className="k-focal"
                                            style={{
                                                left: `${image.focalPoint.x * 100}%`,
                                                top: `${image.focalPoint.y * 100}%`,
                                            }}
                                        />
                                    ) : null}
                                </div>
                            )}
                            {disabled ? null : (
                                <div className="k-sheet-actions">
                                    <MediaPicker current={image.id} disabled={disabled} onPick={pick} />
                                    <span className="k-help">Click the image to set its focus.</span>
                                </div>
                            )}
                            <label className="k-sheet-field">
                                <span className="k-sheet-label">Alt text</span>
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
                                    <Collapsible.Trigger className="k-collapsible-summary">
                                        <ChevronRight {...ICON} />
                                        Crop
                                    </Collapsible.Trigger>
                                    <Collapsible.Panel className="k-collapsible-panel">
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
                                                    <NumberField.Group className="k-crop-edge">
                                                        <span>{edge.label}</span>
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

function ArrayControl(props: ControlProps) {
    const { schema, root, value, onChange, disabled } = props;
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? {};
    const resolvedItem = resolveRef(itemSchema, root);
    const oneRow = typeOf(resolvedItem) === 'object' && fitsOneRow(resolvedItem, root);
    const max = schema.maxItems;
    const min = schema.minItems ?? 0;
    // Editors like rich text read their value once, so a move or a removal remounts every item.
    const [generation, setGeneration] = useState(0);
    const [drag, setDrag] = useState<Drag | undefined>();
    const rows = useRef<Array<HTMLDivElement | null>>([]);
    const reorder = (next: unknown[]): void => {
        setGeneration((current) => current + 1);
        onChange(next);
    };

    const startDrag = (index: number, event: React.PointerEvent<HTMLButtonElement>): void => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);
        const boxes = rows.current.map((row) => row?.getBoundingClientRect());
        const own = boxes[index];
        if (own === undefined) return;
        const step = own.height + 8;
        const startY = event.clientY;
        let current: Drag = {
            from: index,
            to: index,
            offset: 0,
            step,
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
            if (current.to !== current.from) reorder(moveItem(items, current.from, current.to));
        };
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    };

    const keyMove = (index: number, event: React.KeyboardEvent<HTMLButtonElement>): void => {
        const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : undefined;
        if (to === undefined || to < 0 || to >= items.length) return;
        event.preventDefault();
        reorder(moveItem(items, index, to));
        window.requestAnimationFrame(() => rows.current[to]?.querySelector<HTMLButtonElement>('.k-grip')?.focus());
    };

    return (
        <div className="k-list" data-dragging={drag !== undefined}>
            {items.map((item, index) => (
                <div
                    key={`${generation}:${index}`}
                    ref={(row) => {
                        rows.current[index] = row;
                    }}
                    className="k-list-item"
                    data-one-row={oneRow}
                    data-dragged={drag?.from === index}
                    style={{
                        transform: `translateY(${shiftFor(index, drag)}px)`,
                    }}>
                    {disabled ? null : (
                        <button
                            type="button"
                            className="k-grip"
                            aria-label={`Move item ${index + 1}. Drag, or use the arrow keys.`}
                            onPointerDown={(event) => startDrag(index, event)}
                            onKeyDown={(event) => keyMove(index, event)}>
                            <GripVertical {...ICON} />
                        </button>
                    )}
                    <div className="k-list-body">
                        {oneRow ? (
                            <InlineObjectControl
                                {...props}
                                id={undefined}
                                schema={resolvedItem}
                                root={root}
                                value={item}
                                required
                                onChange={(next) => onChange(items.map((existing, at) => (at === index ? next : existing)))}
                            />
                        ) : (
                            <Control
                                {...props}
                                id={undefined}
                                schema={itemSchema}
                                root={root}
                                value={item}
                                required
                                onChange={(next) => onChange(items.map((existing, at) => (at === index ? next : existing)))}
                            />
                        )}
                    </div>
                    {disabled ? null : (
                        <button
                            type="button"
                            className="k-icon-button"
                            disabled={items.length <= min}
                            onClick={() => reorder(items.filter((_, at) => at !== index))}
                            aria-label={`Remove item ${index + 1}`}>
                            <X {...ICON} />
                        </button>
                    )}
                </div>
            ))}
            <div className="k-list-footer">
                {disabled ? (
                    <span />
                ) : (
                    <button
                        type="button"
                        className="k-button k-button-secondary k-button-small"
                        disabled={max !== undefined && items.length >= max}
                        onClick={() => onChange([...items, emptyFor(itemSchema, root)])}>
                        <Plus {...ICON} />
                        Add
                    </button>
                )}
                <span className="k-counter">
                    {items.length}
                    {max !== undefined ? `/${max}` : ''}
                </span>
            </div>
        </div>
    );
}

/**
 * A label beside its input.
 */
export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
    return (
        <div className="k-row">
            <label className="k-row-label" htmlFor={htmlFor} title={label}>
                {label}
            </label>
            <div className="k-row-input">{children}</div>
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
    return (
        <div className="k-group">
            {Object.entries(props.schema.properties ?? {}).map(([name, property]) => (
                <Row key={name} label={humanize(name)}>
                    <PropertyControl props={props} name={name} property={property} />
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
                <div key={name} className="k-inline-field">
                    <label className="k-inline-label" htmlFor={`${base}-${name}`}>
                        {humanize(name)}
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
