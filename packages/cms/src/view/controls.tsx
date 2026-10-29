import { useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Collapsible } from '@base-ui/react/collapsible';
import { Combobox } from '@base-ui/react/combobox';
import { Dialog } from '@base-ui/react/dialog';
import { NumberField } from '@base-ui/react/number-field';
import { Select } from '@base-ui/react/select';
import { Switch } from '@base-ui/react/switch';
import {
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsUpDown,
    GripVertical,
    LoaderCircle,
    Lock,
    LockOpen,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Upload,
    X,
} from 'lucide-react';
import { itemNounOf, movedIndex, remapOpen, rowLabelsOf, singularOf } from './array-rows.js';
import { EditorContext, ICON, useEditorContext } from './context.js';
import { Hint } from './hint.js';
import { cropOf, edgesOf, type CropEdges } from './crop.js';
import { MediaPicker, uploadMedia, type MediaRecord } from './media.js';
import {
    BLOCK_KEY,
    blockOptionsOf,
    emptyFor,
    humanize,
    isImage,
    isRichText,
    itemBlockName,
    resolveRef,
    typeOf,
    type DescribedBlock,
    type JsonSchema,
} from './schema.js';
import { ReferenceSheet, useItemSearch, type SearchResult } from './reference-sheet.js';
import { RichTextControl } from './rich-text.js';
import { isSeo, SeoControl } from './seo.js';
import { counterShown, stringInputOf } from './string-input.js';

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
    /**
     * The field's help, which a list shows beside its Add button.
     */
    help?: string | undefined;
    /**
     * For a list of blocks, what `describe` says of each block: its label,
     * description and the labels of its fields.
     */
    blocks?: DescribedBlock[] | undefined;
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
                <Select.Positioner sideOffset={6} align="start" alignItemWithTrigger={false} className="k-positioner">
                    <Select.Popup className="k-popup k-menu k-menu--select">
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
        <div className="k-text-field" data-counted={counterShown(text.length, schema.maxLength)}>
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
            {counterShown(text.length, schema.maxLength) ? (
                <span className="k-counter" data-over={over}>
                    {text.length} / {schema.maxLength}
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
        <span className="k-toggle">
            <Switch.Root
                className="k-switch"
                id={id}
                checked={value === true}
                onCheckedChange={(checked) => onChange(checked)}
                disabled={disabled}>
                <Switch.Thumb className="k-switch__thumb" />
            </Switch.Root>
            <span className="k-toggle__state" aria-hidden="true">
                {value === true ? 'On' : 'Off'}
            </span>
        </span>
    );
}

/**
 * An id from a collection or a relationship, picked from what its search
 * answers.
 */
function ReferenceControl({ value, onChange, brand, disabled, id }: ControlProps) {
    const { resolveUrl } = useEditorContext();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [chosen, setChosen] = useState<SearchResult | undefined>();
    const current = typeof value === 'string' ? value : '';
    const search = useItemSearch(brand);

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
                                    {result.detail === undefined ? null : <span className="k-picker__detail">{result.detail}</span>}
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

const CROP_EDGES: Array<{ key: keyof CropEdges; label: string }> = [
    {
        key: 'top',
        label: 'Top',
    },
    {
        key: 'right',
        label: 'Right',
    },
    {
        key: 'bottom',
        label: 'Bottom',
    },
    {
        key: 'left',
        label: 'Left',
    },
];

/**
 * An image as a card: a thumbnail, its file name and size, and buttons to
 * edit or remove it. In a narrow column the image shows large above its name.
 * Edit opens a sheet with the image at size, where a click sets the focal
 * point, with its alt text and its crop, kept once the person applies them.
 * An empty field takes an image from the library or a file dropped on it.
 */
function ImageControl({ value, onChange, disabled, required }: ControlProps) {
    const { connection, resolveUrl } = useEditorContext();
    const image = (value ?? {}) as ImageRef;
    const [record, setRecord] = useState<MediaRecord | undefined>();
    const [editing, setEditing] = useState(false);
    const [sheet, setSheet] = useState<ImageRef>(image);
    const [over, setOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
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
    const pick = (picked: MediaRecord): void =>
        onChange({
            ...image,
            id: picked.id,
            alt: image.alt === undefined || image.alt === '' ? (picked.alt ?? '') : image.alt,
            crop: undefined,
            focalPoint: undefined,
        });
    const drop = async (file: File | undefined): Promise<void> => {
        setOver(false);
        if (file === undefined || disabled) return;
        if (!file.type.startsWith('image/')) {
            setProblem('Drop an image file.');
            return;
        }
        setUploading(true);
        setProblem(undefined);
        const uploaded = await uploadMedia(connection, file);
        setUploading(false);
        if ('problem' in uploaded) {
            setProblem(uploaded.problem);
            return;
        }
        pick(uploaded);
    };

    if (image.id === undefined) {
        return (
            <div
                className="k-image-drop"
                data-over={over}
                onDragOver={(event) => {
                    if (disabled) return;
                    event.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    void drop(event.dataTransfer.files[0]);
                }}>
                {over ? (
                    <span className="k-image-drop__over">
                        <Upload {...ICON} />
                        Drop to upload
                    </span>
                ) : uploading ? (
                    <span className="k-image-drop__over">
                        <LoaderCircle {...ICON} className="k-spin" />
                        Uploading
                    </span>
                ) : (
                    <>
                        <MediaPicker current={undefined} disabled={disabled} onPick={pick} />
                        {disabled ? null : <span className="k-image-drop__hint">or drag and drop a file</span>}
                    </>
                )}
                {problem === undefined ? null : (
                    <p className="k-error k-image-drop__problem" role="alert">
                        {problem}
                    </p>
                )}
            </div>
        );
    }

    const source = record === undefined ? undefined : resolveUrl(record.url);
    const edges = record === undefined ? undefined : edgesOf(sheet.crop, record.width, record.height);
    const setEdge = (edge: keyof CropEdges, next: number | null): void => {
        if (record === undefined || edges === undefined) return;
        setSheet({
            ...sheet,
            crop: cropOf(
                {
                    ...edges,
                    [edge]: next ?? 0,
                },
                record.width,
                record.height
            ),
        });
    };
    return (
        <div className="k-image">
            {record === undefined ? (
                <span className="k-image__thumb" aria-hidden="true" />
            ) : (
                <img className="k-image__thumb" src={resolveUrl(`${record.url}?w=640`)} alt={image.alt ?? ''} />
            )}
            <span className="k-image__meta">
                <span className="k-image__name">
                    <span className="k-image__title" title={record?.filename}>
                        {record?.filename ?? 'Image'}
                    </span>
                    {record === undefined ? null : (
                        <span className="k-image__size">
                            {record.width} × {record.height}
                        </span>
                    )}
                </span>
                <span className="k-image__buttons">
                    <Dialog.Root
                        open={editing}
                        onOpenChange={(open) => {
                            if (open) setSheet(image);
                            setEditing(open);
                        }}>
                        <Hint label="Edit image">
                            <Dialog.Trigger className="k-icon-button" aria-label="Edit image">
                                <Pencil {...ICON} />
                            </Dialog.Trigger>
                        </Hint>
                        <Dialog.Portal>
                            <Dialog.Backdrop className="k-backdrop" />
                            <Dialog.Popup className="k-sheet k-sheet--image">
                                <div className="k-sheet__head">
                                    <Dialog.Title className="k-dialog__title k-ellipsis">{record?.filename ?? 'Image'}</Dialog.Title>
                                    <Dialog.Close className="k-icon-button" aria-label="Close">
                                        <X {...ICON} />
                                    </Dialog.Close>
                                </div>
                                {source === undefined ? null : (
                                    <div className="k-sheet__group">
                                        <div className="k-image-frame">
                                            <img
                                                src={source}
                                                alt=""
                                                data-editable={!disabled}
                                                onClick={(event) => {
                                                    if (disabled) return;
                                                    const rect = event.currentTarget.getBoundingClientRect();
                                                    setSheet({
                                                        ...sheet,
                                                        focalPoint: {
                                                            x: Math.round(((event.clientX - rect.left) / rect.width) * 100) / 100,
                                                            y: Math.round(((event.clientY - rect.top) / rect.height) * 100) / 100,
                                                        },
                                                    });
                                                }}
                                            />
                                            {edges === undefined || record === undefined ? null : (
                                                <span
                                                    className="k-image-frame__crop"
                                                    style={{
                                                        top: `${(edges.top / record.height) * 100}%`,
                                                        right: `${(edges.right / record.width) * 100}%`,
                                                        bottom: `${(edges.bottom / record.height) * 100}%`,
                                                        left: `${(edges.left / record.width) * 100}%`,
                                                    }}
                                                />
                                            )}
                                            {sheet.focalPoint !== undefined ? (
                                                <span
                                                    className="k-image-frame__focal"
                                                    style={{
                                                        left: `${sheet.focalPoint.x * 100}%`,
                                                        top: `${sheet.focalPoint.y * 100}%`,
                                                    }}
                                                />
                                            ) : null}
                                        </div>
                                        <div className="k-sheet__row">
                                            <p className="k-help">Click the image to set its focus. Crops keep that point in view.</p>
                                            {disabled || sheet.focalPoint === undefined ? null : (
                                                <button
                                                    type="button"
                                                    className="k-text-button"
                                                    onClick={() =>
                                                        setSheet({
                                                            ...sheet,
                                                            focalPoint: undefined,
                                                        })
                                                    }>
                                                    <RotateCcw {...ICON} />
                                                    Reset focus
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                <div className="k-row">
                                    <label className="k-row__label" htmlFor="k-image-alt">
                                        Alt text
                                        {required === true ? <Required /> : null}
                                    </label>
                                    <div className="k-row__input">
                                        <input
                                            id="k-image-alt"
                                            className="k-input"
                                            type="text"
                                            value={sheet.alt ?? ''}
                                            disabled={disabled}
                                            placeholder="What the image shows"
                                            onChange={(event) =>
                                                setSheet({
                                                    ...sheet,
                                                    alt: event.target.value,
                                                })
                                            }
                                        />
                                        <p className="k-help">What the image shows, for screen readers and search.</p>
                                    </div>
                                </div>
                                {disabled || edges === undefined || record === undefined ? null : (
                                    <Collapsible.Root className="k-collapsible" defaultOpen={sheet.crop !== undefined}>
                                        <Collapsible.Trigger className="k-collapsible__trigger">
                                            <ChevronRight {...ICON} />
                                            Crop
                                        </Collapsible.Trigger>
                                        <Collapsible.Panel className="k-collapsible__panel k-sheet__group">
                                            <div className="k-crop">
                                                {CROP_EDGES.map((edge) => (
                                                    <NumberField.Root
                                                        key={edge.key}
                                                        value={edges[edge.key]}
                                                        min={0}
                                                        step={1}
                                                        onValueChange={(next) => setEdge(edge.key, next)}>
                                                        <NumberField.Group className="k-crop__edge">
                                                            <label className="k-row__label" htmlFor={`k-crop-${edge.key}`}>
                                                                {edge.label}
                                                            </label>
                                                            <NumberField.Input className="k-input" id={`k-crop-${edge.key}`} />
                                                        </NumberField.Group>
                                                    </NumberField.Root>
                                                ))}
                                            </div>
                                            <p className="k-help">
                                                Pixels trimmed from each edge of the {record.width} × {record.height} original.
                                            </p>
                                        </Collapsible.Panel>
                                    </Collapsible.Root>
                                )}
                                {disabled ? null : (
                                    <div className="k-sheet__foot">
                                        <MediaPicker current={image.id} disabled={disabled} onPick={pick} />
                                        <span className="k-review__spacer" />
                                        <Dialog.Close className="k-button k-button--secondary k-button--small">Cancel</Dialog.Close>
                                        <button
                                            type="button"
                                            className="k-button k-button--primary k-button--small"
                                            onClick={() => {
                                                onChange({
                                                    ...sheet,
                                                    alt: sheet.alt ?? '',
                                                });
                                                setEditing(false);
                                            }}>
                                            Apply
                                        </button>
                                    </div>
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
    return typeOf(item) === 'object' && !isImage(itemSchema, root) && !isRichText(item) && !isSeo(item);
};

/**
 * Whether a schema edits as a list of items, rather than as rich text, which
 * stores a list too.
 */
export const listsItems = (schema: JsonSchema): boolean => {
    const resolved = resolveRef(schema, schema);
    return typeOf(resolved) === 'array' && !isRichText(schema) && !isRichText(resolved);
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
    const folds = foldsItems(schema, root);
    const max = schema.maxItems;
    const min = schema.minItems ?? 0;
    const noun = itemNounOf(itemSchema, root, props.label);
    const blockOptions = blockOptionsOf(itemSchema, root);
    const choices = (blockOptions ?? []).map((option) => {
        const described = props.blocks?.find((block) => block.name === option.name);
        return {
            ...option,
            described,
            label: described?.label ?? humanize(option.name),
        };
    });
    const [picking, setPicking] = useState(false);
    // Editors like rich text read their value once, so a move or a removal remounts every item.
    const [generation, setGeneration] = useState(0);
    const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
    const reorder = (next: unknown[], remap: (index: number) => number | undefined): void => {
        setGeneration((current) => current + 1);
        setOpen((previous) => remapOpen(previous, remap));
        onChange(next);
    };
    const moveTo = (from: number, to: number): void => reorder(moveItem(items, from, to), (index) => movedIndex(index, from, to));
    const offerUndo = useContext(EditorContext)?.offerUndo;
    // Undo puts a removed item back into the list as it is by then, so it reads the latest.
    const latest = useRef({
        items,
        reorder,
    });
    latest.current = {
        items,
        reorder,
    };
    const undoToasts = useRef(new Set<() => void>());
    // A list that goes away, with its document, can no longer take an item back.
    useEffect(() => {
        const shown = undoToasts.current;
        return () => {
            for (const close of shown) close();
        };
    }, []);
    const remove = (at: number): void => {
        const removed = items[at];
        reorder(
            items.filter((_, index) => index !== at),
            (index) => (index === at ? undefined : index > at ? index - 1 : index)
        );
        if (offerUndo === undefined) return;
        const close = offerUndo(`Removed ${noun} ${at + 1}.`, () => {
            undoToasts.current.delete(close);
            const now = latest.current.items;
            const place = Math.min(at, now.length);
            latest.current.reorder([...now.slice(0, place), removed, ...now.slice(place)], (index) => (index >= place ? index + 1 : index));
        });
        undoToasts.current.add(close);
    };
    const add = (): void => {
        onChange([...items, emptyFor(itemSchema, root)]);
        if (folds) setOpen((previous) => new Set([...previous, items.length]));
    };
    // A new block starts as its name alone, so its fields read as not filled in yet rather than as wrong.
    const addBlock = (name: string): void => {
        setPicking(false);
        onChange([
            ...items,
            {
                [BLOCK_KEY]: name,
            },
        ]);
        setOpen((previous) => new Set([...previous, items.length]));
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
                aria-label={`Move ${noun} ${index + 1}. Drag, or use the arrow keys.`}
                onPointerDown={(event) => startDrag(index, event)}
                onKeyDown={(event) => keyMove(index, event)}>
                <GripVertical {...ICON} />
            </button>
        );

    const footer =
        disabled && props.help === undefined ? null : (
            <div className="k-array__foot">
                {props.help === undefined ? <span /> : <p className="k-help">{props.help}</p>}
                {disabled ? null : (
                    <button
                        type="button"
                        className="k-button k-button--secondary k-button--small k-array__add"
                        disabled={max !== undefined && items.length >= max}
                        onClick={() => {
                            if (choices.length === 0) add();
                            else if (choices.length === 1) addBlock(choices[0]!.name);
                            else setPicking(true);
                        }}>
                        <Plus {...ICON} />
                        Add {noun}
                    </button>
                )}
            </div>
        );

    if (folds) {
        const allOpen = items.length > 0 && items.every((_, index) => open.has(index));
        return (
            <div className="k-array k-array--folds" data-dragging={drag !== undefined}>
                <div className="k-array__head">
                    {props.heading ?? <span />}
                    {items.length < 2 ? null : (
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
                            const choice =
                                blockOptions === undefined ? undefined : choices.find((each) => each.name === itemBlockName(item));
                            const labels = rowLabelsOf(choice?.schema ?? resolvedItem, root, item);
                            const title = labels.title;
                            const tag = blockOptions === undefined ? labels.tag : (choice?.label ?? itemBlockName(item));
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
                                            {tag === undefined ? null : <span className="k-array__tag">{tag}</span>}
                                            <span className="k-array__title" data-empty={title === undefined}>
                                                {title ?? 'Untitled'}
                                            </span>
                                        </Collapsible.Trigger>
                                        <Collapsible.Trigger
                                            className="k-icon-button k-array__chevron"
                                            aria-label={isOpen ? `Collapse ${noun} ${index + 1}` : `Expand ${noun} ${index + 1}`}>
                                            <ChevronDown {...ICON} />
                                        </Collapsible.Trigger>
                                        {disabled ? null : (
                                            <button
                                                type="button"
                                                className="k-icon-button"
                                                disabled={items.length <= min}
                                                onClick={() => remove(index)}
                                                aria-label={`Remove ${noun} ${index + 1}`}>
                                                <X {...ICON} />
                                            </button>
                                        )}
                                    </div>
                                    <Collapsible.Panel keepMounted className="k-array__panel">
                                        {blockOptions === undefined ? (
                                            <ObjectControl
                                                {...props}
                                                id={undefined}
                                                heading={undefined}
                                                help={undefined}
                                                label={undefined}
                                                schema={resolvedItem}
                                                root={root}
                                                value={item}
                                                required
                                                onChange={(next) => changeItem(index, next)}
                                            />
                                        ) : choice === undefined ? (
                                            <div className="k-unsupported">
                                                <pre>{JSON.stringify(item, null, 2)}</pre>
                                                <p className="k-help">
                                                    This block is no longer one the list holds. Remove it, or ask the model to.
                                                </p>
                                            </div>
                                        ) : (
                                            <BlockFields
                                                {...props}
                                                id={undefined}
                                                heading={undefined}
                                                help={undefined}
                                                label={undefined}
                                                schema={choice.schema}
                                                root={root}
                                                value={item}
                                                described={choice.described}
                                                required
                                                onChange={(next) => changeItem(index, next)}
                                            />
                                        )}
                                    </Collapsible.Panel>
                                </Collapsible.Root>
                            );
                        })}
                    </div>
                )}
                {footer}
                {choices.length > 1 ? (
                    <BlockPicker
                        open={picking}
                        onOpenChange={setPicking}
                        noun={noun}
                        label={props.label}
                        choices={choices}
                        onPick={addBlock}
                    />
                ) : null}
            </div>
        );
    }

    // A list of single values, like ids or choices, shows each value's control in a filled row.
    const single = ['string', 'number', 'integer', 'boolean'].includes(typeOf(resolvedItem) ?? '');
    return (
        <div className="k-array" data-dragging={drag !== undefined}>
            {items.map((item, index) => (
                <div
                    key={`${generation}:${index}`}
                    ref={(row) => {
                        rows.current[index] = row;
                    }}
                    className={single ? 'k-array__item k-array__item--value' : 'k-array__item'}
                    data-dragged={drag?.from === index}
                    style={{
                        transform: `translateY(${shiftFor(index, drag)}px)`,
                    }}>
                    {grip(index)}
                    <div className="k-array__body">
                        <Control
                            {...props}
                            id={undefined}
                            name={undefined}
                            label={undefined}
                            heading={undefined}
                            help={undefined}
                            blocks={undefined}
                            schema={itemSchema}
                            root={root}
                            value={item}
                            required
                            onChange={(next) => changeItem(index, next)}
                        />
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
 * What one id of a list and the list as a whole are called, in lower case,
 * from its label: "product" and "products" for Products.
 */
const referenceNounOf = (label: string | undefined): { one: string; many: string } => {
    const many = (label ?? 'items').toLowerCase();
    const one = singularOf(many);
    return {
        one: one === many ? 'item' : one,
        many,
    };
};

/**
 * A list of ids from a collection or a relationship: a row for each, with
 * its thumbnail and detail, in the order the editor drags them into, and a
 * button that opens the sheet to choose them.
 */
function ReferenceListControl(props: ControlProps & { brand: string }) {
    const { schema, value, onChange, disabled, brand } = props;
    const { resolveUrl } = useEditorContext();
    const ids = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    const search = useItemSearch(brand);
    const [named, setNamed] = useState<ReadonlyMap<string, SearchResult>>(new Map());
    const [picking, setPicking] = useState(false);
    const noun = referenceNounOf(props.label);
    const unnamed = ids.filter((id) => !named.has(id)).join('\n');

    useEffect(() => {
        if (unnamed === '') return;
        let current = true;
        void search({
            ids: unnamed.split('\n'),
        }).then((found) => {
            if (!current) return;
            setNamed((previous) => new Map([...previous, ...found.map((result): [string, SearchResult] => [result.id, result])]));
        });
        return () => {
            current = false;
        };
    }, [unnamed, search]);

    const moveTo = (from: number, to: number): void => onChange(moveItem(ids, from, to));
    const { drag, rows, startDrag } = useDrag(disabled, moveTo);
    const keyMove = (index: number, event: React.KeyboardEvent<HTMLButtonElement>): void => {
        const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : undefined;
        if (to === undefined || to < 0 || to >= ids.length) return;
        event.preventDefault();
        moveTo(index, to);
        window.requestAnimationFrame(() => rows.current[to]?.querySelector<HTMLButtonElement>('.k-array__grip')?.focus());
    };

    return (
        <div className="k-array k-references" data-dragging={drag !== undefined}>
            {ids.map((id, index) => {
                const result = named.get(id);
                const label = result?.label ?? id;
                return (
                    <div
                        key={id}
                        ref={(row) => {
                            rows.current[index] = row;
                        }}
                        className="k-array__item k-references__item"
                        data-dragged={drag?.from === index}
                        style={{
                            transform: `translateY(${shiftFor(index, drag)}px)`,
                        }}>
                        {disabled ? null : (
                            <button
                                type="button"
                                className="k-array__grip"
                                aria-label={`Move ${label}. Drag, or use the arrow keys.`}
                                onPointerDown={(event) => startDrag(index, event)}
                                onKeyDown={(event) => keyMove(index, event)}>
                                <GripVertical {...ICON} />
                            </button>
                        )}
                        {result?.image === undefined ? (
                            <span className="k-references__thumb" aria-hidden="true" />
                        ) : (
                            <img className="k-references__thumb" src={resolveUrl(result.image)} alt="" />
                        )}
                        <span className="k-references__label k-ellipsis">{label}</span>
                        {result?.detail === undefined ? null : <span className="k-references__detail">{result.detail}</span>}
                        {disabled ? null : (
                            <button
                                type="button"
                                className="k-icon-button"
                                disabled={ids.length <= (schema.minItems ?? 0)}
                                onClick={() => onChange(ids.filter((_, at) => at !== index))}
                                aria-label={`Remove ${label}`}>
                                <X {...ICON} />
                            </button>
                        )}
                    </div>
                );
            })}
            {disabled && props.help === undefined ? null : (
                <div className="k-array__foot">
                    {props.help === undefined ? <span /> : <p className="k-help">{props.help}</p>}
                    {disabled ? null : (
                        <button
                            type="button"
                            className="k-button k-button--secondary k-button--small k-array__add"
                            aria-haspopup="dialog"
                            onClick={() => setPicking(true)}>
                            <Plus {...ICON} />
                            Choose {noun.many}
                        </button>
                    )}
                </div>
            )}
            <ReferenceSheet
                open={picking}
                onOpenChange={setPicking}
                brand={brand}
                chosen={ids}
                named={named}
                max={schema.maxItems}
                noun={noun}
                onApply={(picked, known) => {
                    setNamed(known);
                    onChange(picked);
                }}
            />
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
 * The control for one property of an object, writing the object as a whole.
 */
function PropertyControl({
    props,
    name,
    property,
    id,
    label,
    labels,
}: {
    props: ControlProps;
    name: string;
    property: JsonSchema;
    id?: string;
    label?: string;
    labels?: Record<string, string>;
}) {
    const current = (props.value ?? {}) as Record<string, unknown>;
    return (
        <Control
            {...props}
            id={id}
            schema={property}
            brand={undefined}
            searchTool={undefined}
            labels={labels}
            name={name}
            label={label ?? humanize(name)}
            heading={undefined}
            help={undefined}
            blocks={undefined}
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
 * One item of a list of blocks, open: its block's fields in order, each with
 * the label and help its block gives it.
 */
function BlockFields({ described, ...props }: ControlProps & { described: DescribedBlock | undefined }) {
    const base = useId();
    const required = props.schema.required ?? [];
    return (
        <div className="k-fields">
            {Object.entries(props.schema.properties ?? {})
                .filter(([name]) => name !== BLOCK_KEY)
                .map(([name, property]) => {
                    const field = described?.fields.find((candidate) => candidate.name === name);
                    const label = field?.label ?? humanize(name);
                    return (
                        <div key={name} className="k-block-field">
                            <Row label={label} htmlFor={`${base}-${name}`} required={required.includes(name)}>
                                <PropertyControl
                                    props={props}
                                    name={name}
                                    property={property}
                                    id={`${base}-${name}`}
                                    label={label}
                                    labels={field?.options}
                                />
                            </Row>
                            {field?.description === undefined ? null : <p className="k-help">{field.description}</p>}
                        </div>
                    );
                })}
        </div>
    );
}

/**
 * How many blocks a picker lists before it offers a search.
 */
const SEARCHED_FROM = 6;

/**
 * The sheet Add opens on a list of blocks: every block it may hold, by label
 * and description, with a search once there are more than a few.
 */
function BlockPicker({
    open,
    onOpenChange,
    noun,
    label,
    choices,
    onPick,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    noun: string;
    label: string | undefined;
    choices: ReadonlyArray<{
        name: string;
        label: string;
        described: DescribedBlock | undefined;
    }>;
    onPick: (name: string) => void;
}) {
    const [query, setQuery] = useState('');
    const term = query.trim().toLowerCase();
    const shown = choices.filter(
        (choice) => term === '' || `${choice.label} ${choice.described?.description ?? ''}`.toLowerCase().includes(term)
    );
    return (
        <Dialog.Root
            open={open}
            onOpenChange={(next) => {
                onOpenChange(next);
                if (!next) setQuery('');
            }}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-block-picker">
                    <div className="k-block-picker__head">
                        <Dialog.Title className="k-dialog__title">Add {noun}</Dialog.Title>
                        {choices.length > SEARCHED_FROM ? (
                            <label className="k-block-picker__search">
                                <Search {...ICON} />
                                <input
                                    type="search"
                                    className="k-input"
                                    placeholder={`Search ${(label ?? 'blocks').toLowerCase()}`}
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                />
                            </label>
                        ) : null}
                        <Dialog.Close className="k-icon-button" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    {shown.length === 0 ? (
                        <p className="k-help">Nothing matches “{query.trim()}”.</p>
                    ) : (
                        <ul className="k-block-picker__list">
                            {shown.map((choice) => (
                                <li key={choice.name}>
                                    <button type="button" className="k-block-picker__card" onClick={() => onPick(choice.name)}>
                                        <span className="k-block-picker__name">{choice.label}</span>
                                        {choice.described?.description === undefined ? null : (
                                            <span className="k-block-picker__description">{choice.described.description}</span>
                                        )}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
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
    const listed = typeOf(resolved) === 'array' ? resolveRef(resolved.items ?? {}, props.root) : undefined;
    const listedBrand = brand ?? listed?.brand;
    if (listed !== undefined && listedBrand !== undefined && typeOf(listed) === 'string') {
        return <ReferenceListControl {...props} schema={resolved} brand={listedBrand} />;
    }
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
