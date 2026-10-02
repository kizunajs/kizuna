'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { decodePath, IMAGE_MARKER } from './source-path.js';

type JsonSchema = Record<string, unknown> & {
    type?: string | string[];
    format?: string;
    enum?: unknown[];
    maxLength?: number;
    minLength?: number;
    minimum?: number;
    maximum?: number;
    minItems?: number;
    maxItems?: number;
    items?: JsonSchema;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    description?: string;
    brand?: string;
    pattern?: string;
    $ref?: string;
    $defs?: Record<string, JsonSchema>;
    anyOf?: JsonSchema[];
};

interface DescribedField {
    path: string;
    name: string;
    label?: string;
    description?: string;
    block?: string;
    parent?: string;
    readOnly: boolean;
    writable: boolean;
    roles?: string[];
    brand?: string;
    searchTool?: string;
    schema: JsonSchema;
    value?: unknown;
}

interface Description {
    name: string;
    path: string;
    status: 'empty' | 'draft' | 'published' | 'changed';
    version: number;
    complete: boolean;
    missing: string[];
    fields: DescribedField[];
    draft: Record<string, unknown> | null;
}

interface Problem {
    detail?: string;
    errors?: Array<{ path: string[]; message: string }>;
}

export interface PreviewOverlayProps {
    apiPath: string;
    basePath: string;
    draftPath: string;
    headers?: Record<string, string>;
}

const palette = {
    text: '#111',
    muted: '#666',
    border: '#d9d9d9',
    surface: '#fff',
    faint: '#f4f4f4',
};

const font = 'system-ui, -apple-system, sans-serif';

const styles: Record<string, CSSProperties> = {
    bar: {
        position: 'fixed',
        left: '1rem',
        bottom: '1rem',
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0.75rem',
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: '0.5rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        fontFamily: font,
        fontSize: '0.85rem',
    },
    button: {
        font: 'inherit',
        padding: '0.35rem 0.7rem',
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: '0.35rem',
        cursor: 'pointer',
    },
    primary: {
        background: palette.text,
        color: palette.surface,
        borderColor: palette.text,
    },
    panel: {
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        bottom: '1rem',
        width: 'min(26rem, calc(100vw - 2rem))',
        zIndex: 2147483000,
        overflow: 'auto',
        padding: '1rem',
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: '0.5rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
        fontFamily: font,
        fontSize: '0.85rem',
    },
    popover: {
        position: 'fixed',
        zIndex: 2147483001,
        width: 'min(22rem, calc(100vw - 2rem))',
        padding: '0.75rem',
        background: palette.surface,
        color: palette.text,
        border: `1px solid ${palette.border}`,
        borderRadius: '0.5rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.16)',
        fontFamily: font,
        fontSize: '0.85rem',
    },
    label: {
        display: 'block',
        fontWeight: 600,
        marginBottom: '0.25rem',
    },
    help: {
        color: palette.muted,
        fontSize: '0.78rem',
        margin: '0.25rem 0 0',
    },
    input: {
        font: 'inherit',
        width: '100%',
        boxSizing: 'border-box',
        padding: '0.4rem 0.5rem',
        border: `1px solid ${palette.border}`,
        borderRadius: '0.35rem',
        background: palette.surface,
        color: palette.text,
    },
    counter: {
        textAlign: 'right',
        color: palette.muted,
        fontSize: '0.75rem',
    },
    row: {
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center',
    },
    error: {
        color: palette.text,
        background: palette.faint,
        padding: '0.5rem',
        borderRadius: '0.35rem',
        fontSize: '0.8rem',
    },
    group: {
        border: `1px solid ${palette.border}`,
        borderRadius: '0.35rem',
        padding: '0.5rem',
        marginTop: '0.25rem',
    },
};

const resolveRef = (schema: JsonSchema, root: JsonSchema): JsonSchema => {
    if (schema.$ref === undefined) return schema;
    const name = schema.$ref.replace('#/$defs/', '');
    return root.$defs?.[name] ?? schema;
};

const isImage = (schema: JsonSchema, root: JsonSchema): boolean => {
    const resolved = resolveRef(schema, root);
    if (schema.$ref === '#/$defs/CmsImage' || resolved['id'] === 'CmsImage') return true;
    const keys = Object.keys(resolved.properties ?? {});
    return keys.includes('id') && keys.includes('alt') && keys.every((key) => ['id', 'alt', 'crop', 'focalPoint'].includes(key));
};

const typeOf = (schema: JsonSchema): string | undefined => {
    if (Array.isArray(schema.type)) return schema.type.find((candidate) => candidate !== 'null');
    if (schema.type !== undefined) return schema.type;
    if (schema.anyOf !== undefined) return typeOf(schema.anyOf.find((option) => option.type !== 'null') ?? {});
    return undefined;
};

const emptyFor = (schema: JsonSchema, root: JsonSchema): unknown => {
    const resolved = resolveRef(schema, root);
    switch (typeOf(resolved)) {
        case 'string':
            return '';
        case 'number':
        case 'integer':
            return resolved.minimum ?? 0;
        case 'boolean':
            return false;
        case 'array':
            return [];
        case 'object': {
            const value: Record<string, unknown> = {};
            for (const key of resolved.required ?? []) value[key] = emptyFor(resolved.properties?.[key] ?? {}, root);
            return value;
        }
        default:
            return undefined;
    }
};

const humanize = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .replace(/^./, (first) => first.toUpperCase());

interface Api {
    call: (
        method: string,
        path: string,
        body?: unknown,
        extra?: Record<string, string>
    ) => Promise<{ status: number; body: unknown; etag: string | null }>;
}

const useApi = (props: PreviewOverlayProps): Api =>
    useMemo(
        () => ({
            call: async (method, path, body, extra) => {
                const response = await fetch(`${props.apiPath}${props.basePath}${path}`, {
                    method,
                    credentials: 'include',
                    headers: {
                        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                        ...props.headers,
                        ...extra,
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                });
                const text = await response.text();
                let parsed: unknown = undefined;
                try {
                    parsed = text === '' ? undefined : JSON.parse(text);
                } catch {
                    parsed = text;
                }
                return {
                    status: response.status,
                    body: parsed,
                    etag: response.headers.get('etag'),
                };
            },
        }),
        [props.apiPath, props.basePath, props.headers]
    );

interface InputProps {
    schema: JsonSchema;
    root: JsonSchema;
    value: unknown;
    onChange: (value: unknown) => void;
    api: Api;
    brand?: string;
    searchTool?: string;
    required?: boolean;
}

function StringInput({ schema, value, onChange, required }: InputProps) {
    const text = typeof value === 'string' ? value : '';
    const set = (next: string): void => onChange(next === '' && required !== true ? undefined : next);
    if (schema.enum !== undefined) {
        return (
            <select style={styles.input} value={text} onChange={(event) => set(event.target.value)}>
                {required !== true ? <option value="">—</option> : null}
                {schema.enum.map((option) => (
                    <option key={String(option)} value={String(option)}>
                        {String(option)}
                    </option>
                ))}
            </select>
        );
    }
    if (schema.format === 'uri') {
        const httpsOnly = schema.pattern?.includes('https') === true;
        return (
            <>
                <input
                    style={styles.input}
                    type="url"
                    value={text}
                    placeholder={httpsOnly ? 'https://' : 'https:// or http://'}
                    onChange={(event) => set(event.target.value)}
                />
                <p style={styles.help}>{httpsOnly ? 'https links only.' : 'A full link, with its protocol.'}</p>
            </>
        );
    }
    if (schema.format === 'date') {
        return <input style={styles.input} type="date" value={text} onChange={(event) => set(event.target.value)} />;
    }
    if (schema.format === 'date-time') {
        return (
            <input
                style={styles.input}
                type="datetime-local"
                value={text.slice(0, 16)}
                onChange={(event) => set(event.target.value === '' ? '' : new Date(event.target.value).toISOString())}
            />
        );
    }
    const long = (schema.maxLength ?? 0) > 120 || schema.maxLength === undefined;
    const over = schema.maxLength !== undefined && text.length > schema.maxLength;
    return (
        <>
            {long ? (
                <textarea
                    style={{ ...styles.input, minHeight: '5rem', resize: 'vertical' }}
                    value={text}
                    onChange={(event) => set(event.target.value)}
                />
            ) : (
                <input style={styles.input} type="text" value={text} onChange={(event) => set(event.target.value)} />
            )}
            {schema.maxLength !== undefined ? (
                <div style={{ ...styles.counter, fontWeight: over ? 700 : 400 }}>
                    {text.length} / {schema.maxLength}
                </div>
            ) : null}
        </>
    );
}

function NumberInput({ schema, value, onChange }: InputProps) {
    const integer = typeOf(schema) === 'integer';
    return (
        <input
            style={styles.input}
            type="number"
            value={typeof value === 'number' ? value : ''}
            min={schema.minimum}
            max={schema.maximum}
            step={integer ? 1 : 'any'}
            onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        />
    );
}

function BooleanInput({ value, onChange }: InputProps) {
    return (
        <label style={styles.row}>
            <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
            <span>{value === true ? 'On' : 'Off'}</span>
        </label>
    );
}

function ReferenceInput({ value, onChange, api, brand, searchTool }: InputProps) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<Array<{ id: string; label: string; image?: string }>>([]);
    const [open, setOpen] = useState(false);
    const text = typeof value === 'string' ? value : '';
    const search = useCallback(
        async (term: string) => {
            if (brand === undefined || searchTool === undefined) return;
            const result = await api.call('GET', `/items/${encodeURIComponent(brand)}?q=${encodeURIComponent(term)}`);
            if (result.status === 200) setItems((result.body as { items: typeof items }).items);
        },
        [api, brand, searchTool]
    );
    return (
        <div>
            <input
                style={styles.input}
                type="text"
                value={text}
                placeholder={brand === undefined ? 'id' : `${brand}`}
                onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
            />
            {searchTool !== undefined ? (
                <div style={{ marginTop: '0.35rem' }}>
                    <div style={styles.row}>
                        <input
                            style={styles.input}
                            type="search"
                            placeholder="Search"
                            value={query}
                            onFocus={() => {
                                setOpen(true);
                                void search(query);
                            }}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                void search(event.target.value);
                            }}
                        />
                    </div>
                    {open && items.length > 0 ? (
                        <ul
                            style={{
                                listStyle: 'none',
                                margin: '0.25rem 0 0',
                                padding: 0,
                                maxHeight: '10rem',
                                overflow: 'auto',
                                border: `1px solid ${palette.border}`,
                                borderRadius: '0.35rem',
                            }}>
                            {items.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        style={{
                                            ...styles.button,
                                            border: 'none',
                                            borderRadius: 0,
                                            width: '100%',
                                            textAlign: 'left',
                                            display: 'flex',
                                            gap: '0.5rem',
                                            alignItems: 'center',
                                            background: item.id === text ? palette.faint : palette.surface,
                                        }}
                                        onClick={() => {
                                            onChange(item.id);
                                            setOpen(false);
                                        }}>
                                        {item.image !== undefined ? (
                                            <img
                                                src={item.image}
                                                alt=""
                                                style={{ width: '1.5rem', height: '1.5rem', objectFit: 'cover', filter: 'grayscale(1)' }}
                                            />
                                        ) : null}
                                        <span>{item.label}</span>
                                        <span style={{ ...styles.help, marginLeft: 'auto' }}>{item.id}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

interface ImageRef {
    id?: string;
    alt?: string;
    crop?: { x: number; y: number; width: number; height: number };
    focalPoint?: { x: number; y: number };
}

function ImageInput({ value, onChange, api }: InputProps) {
    const ref = (value ?? {}) as ImageRef;
    const [preview, setPreview] = useState<{ url: string; width: number; height: number } | undefined>();
    const [uploading, setUploading] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    useEffect(() => {
        if (ref.id === undefined) {
            setPreview(undefined);
            return;
        }
        void api.call('GET', `/media/${encodeURIComponent(ref.id)}`).then((result) => {
            if (result.status === 200) setPreview(result.body as { url: string; width: number; height: number });
        });
    }, [api, ref.id]);
    const set = (patch: Partial<ImageRef>): void => onChange({ ...ref, alt: ref.alt ?? '', ...patch });
    const upload = async (file: File): Promise<void> => {
        setUploading(true);
        setProblem(undefined);
        try {
            const created = await api.call('POST', '/media/uploads', {
                filename: file.name,
                contentType: file.type,
                size: file.size,
            });
            if (created.status !== 201) throw new Error((created.body as Problem).detail ?? 'The upload was refused.');
            const upload = created.body as { uploadId: string; url: string; headers: Record<string, string> };
            const put = await fetch(upload.url, {
                method: 'PUT',
                headers: upload.headers,
                body: file,
            });
            if (!put.ok) throw new Error(`The storage answered ${put.status}.`);
            const completed = await api.call('POST', `/media/uploads/${encodeURIComponent(upload.uploadId)}`);
            if (completed.status !== 201) throw new Error((completed.body as Problem).detail ?? 'The file was refused.');
            set({
                id: (completed.body as { id: string }).id,
                crop: undefined,
                focalPoint: undefined,
            });
        } catch (error) {
            setProblem(error instanceof Error ? error.message : String(error));
        } finally {
            setUploading(false);
        }
    };
    return (
        <div>
            {preview !== undefined ? (
                <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                    <img
                        src={preview.url}
                        alt=""
                        style={{ width: '100%', display: 'block', border: `1px solid ${palette.border}`, cursor: 'crosshair' }}
                        onClick={(event) => {
                            const rect = event.currentTarget.getBoundingClientRect();
                            set({
                                focalPoint: {
                                    x: Math.round(((event.clientX - rect.left) / rect.width) * 100) / 100,
                                    y: Math.round(((event.clientY - rect.top) / rect.height) * 100) / 100,
                                },
                            });
                        }}
                    />
                    {ref.focalPoint !== undefined ? (
                        <span
                            style={{
                                position: 'absolute',
                                left: `${ref.focalPoint.x * 100}%`,
                                top: `${ref.focalPoint.y * 100}%`,
                                width: '0.75rem',
                                height: '0.75rem',
                                marginLeft: '-0.375rem',
                                marginTop: '-0.375rem',
                                borderRadius: '50%',
                                border: '2px solid #fff',
                                background: '#111',
                                pointerEvents: 'none',
                            }}
                        />
                    ) : null}
                    <p style={styles.help}>
                        {preview.width} × {preview.height}. Click to set the focal point.
                    </p>
                </div>
            ) : null}
            <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                disabled={uploading}
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file !== undefined) void upload(file);
                }}
            />
            {uploading ? <p style={styles.help}>Uploading…</p> : null}
            {problem !== undefined ? <p style={styles.error}>{problem}</p> : null}
            <label style={{ ...styles.label, marginTop: '0.5rem' }}>Alt text</label>
            <input style={styles.input} type="text" value={ref.alt ?? ''} onChange={(event) => set({ alt: event.target.value })} />
            <p style={styles.help}>What the image shows. Leave empty for a decorative image.</p>
            <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer' }}>Crop</summary>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem', marginTop: '0.35rem' }}>
                    {(['x', 'y', 'width', 'height'] as const).map((key) => (
                        <label key={key}>
                            <span style={styles.help}>{key}</span>
                            <input
                                style={styles.input}
                                type="number"
                                min={0}
                                max={1}
                                step={0.01}
                                value={ref.crop?.[key] ?? (key === 'width' || key === 'height' ? 1 : 0)}
                                onChange={(event) =>
                                    set({
                                        crop: {
                                            x: 0,
                                            y: 0,
                                            width: 1,
                                            height: 1,
                                            ...ref.crop,
                                            [key]: Number(event.target.value),
                                        },
                                    })
                                }
                            />
                        </label>
                    ))}
                </div>
                <button type="button" style={{ ...styles.button, marginTop: '0.35rem' }} onClick={() => set({ crop: undefined })}>
                    Clear crop
                </button>
            </details>
        </div>
    );
}

function ArrayInput(props: InputProps) {
    const { schema, root, value, onChange, api } = props;
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? {};
    const update = (next: unknown[]): void => onChange(next);
    const max = schema.maxItems;
    const min = schema.minItems ?? 0;
    return (
        <div>
            {items.map((item, index) => (
                <div key={index} style={{ ...styles.group, display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                        <FieldInput
                            schema={itemSchema}
                            root={root}
                            value={item}
                            api={api}
                            brand={props.brand}
                            searchTool={props.searchTool}
                            required
                            onChange={(next) => update(items.map((existing, at) => (at === index ? next : existing)))}
                        />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <button
                            type="button"
                            style={styles.button}
                            disabled={index === 0}
                            onClick={() => update(move(items, index, index - 1))}
                            aria-label="Move up">
                            ↑
                        </button>
                        <button
                            type="button"
                            style={styles.button}
                            disabled={index === items.length - 1}
                            onClick={() => update(move(items, index, index + 1))}
                            aria-label="Move down">
                            ↓
                        </button>
                        <button
                            type="button"
                            style={styles.button}
                            disabled={items.length <= min}
                            onClick={() => update(items.filter((_, at) => at !== index))}
                            aria-label="Remove">
                            ×
                        </button>
                    </div>
                </div>
            ))}
            <div style={{ ...styles.row, marginTop: '0.35rem' }}>
                <button
                    type="button"
                    style={styles.button}
                    disabled={max !== undefined && items.length >= max}
                    onClick={() => update([...items, emptyFor(itemSchema, root)])}>
                    Add
                </button>
                <span style={styles.help}>
                    {items.length}
                    {max !== undefined ? ` / ${max}` : ''}
                    {min > 0 ? `, at least ${min}` : ''}
                </span>
            </div>
        </div>
    );
}

const move = (items: unknown[], from: number, to: number): unknown[] => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

function ObjectInput({ schema, root, value, onChange, api }: InputProps) {
    const current = (value ?? {}) as Record<string, unknown>;
    return (
        <div style={styles.group}>
            {Object.entries(schema.properties ?? {}).map(([key, property]) => (
                <div key={key} style={{ marginBottom: '0.5rem' }}>
                    <label style={styles.label}>{humanize(key)}</label>
                    <FieldInput
                        schema={property}
                        root={root}
                        value={current[key]}
                        api={api}
                        required={schema.required?.includes(key)}
                        onChange={(next) => {
                            const updated = { ...current };
                            if (next === undefined) delete updated[key];
                            else updated[key] = next;
                            onChange(updated);
                        }}
                    />
                    {resolveRef(property, root).description !== undefined ? (
                        <p style={styles.help}>{resolveRef(property, root).description}</p>
                    ) : null}
                </div>
            ))}
        </div>
    );
}

function FieldInput(props: InputProps) {
    const resolved = resolveRef(props.schema, props.root);
    const brand = props.brand ?? resolved.brand;
    if (isImage(props.schema, props.root)) return <ImageInput {...props} schema={resolved} />;
    if (brand !== undefined && typeOf(resolved) !== 'array') return <ReferenceInput {...props} schema={resolved} brand={brand} />;
    switch (typeOf(resolved)) {
        case 'string':
            return <StringInput {...props} schema={resolved} />;
        case 'number':
        case 'integer':
            return <NumberInput {...props} schema={resolved} />;
        case 'boolean':
            return <BooleanInput {...props} schema={resolved} />;
        case 'array':
            return <ArrayInput {...props} schema={resolved} brand={brand} />;
        case 'object':
            return <ObjectInput {...props} schema={resolved} />;
        default:
            return (
                <div>
                    <pre style={{ ...styles.group, overflow: 'auto', margin: 0, fontSize: '0.75rem' }}>
                        {JSON.stringify(props.value, null, 2)}
                    </pre>
                    <p style={styles.help}>This value has no input yet. Change it through the agent.</p>
                </div>
            );
    }
}

interface FieldEditorProps {
    field: DescribedField;
    initial: unknown;
    api: Api;
    onSave: (path: string, value: unknown) => Promise<string | undefined>;
    onClose?: () => void;
}

function FieldEditor({ field, initial, api, onSave, onClose }: FieldEditorProps) {
    const [value, setValue] = useState<unknown>(initial);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const save = async (): Promise<void> => {
        setBusy(true);
        setProblem(undefined);
        const failure = await onSave(field.path, value);
        setBusy(false);
        if (failure !== undefined) setProblem(failure);
        else onClose?.();
    };
    return (
        <div>
            <label style={styles.label}>{field.label ?? humanize(field.name)}</label>
            {field.writable ? (
                <FieldInput
                    schema={field.schema}
                    root={field.schema}
                    value={value}
                    onChange={setValue}
                    api={api}
                    brand={field.brand}
                    searchTool={field.searchTool}
                    required
                />
            ) : (
                <p style={styles.help}>
                    {field.readOnly ? 'Read only.' : `Only ${field.roles?.join(' or ') ?? 'another role'} may change this.`}
                </p>
            )}
            {field.description !== undefined ? <p style={styles.help}>{field.description}</p> : null}
            {problem !== undefined ? (
                <p style={styles.error} role="alert">
                    {problem}
                </p>
            ) : null}
            <div style={{ ...styles.row, marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                {onClose !== undefined ? (
                    <button type="button" style={styles.button} onClick={onClose}>
                        Cancel
                    </button>
                ) : null}
                {field.writable ? (
                    <button type="button" style={{ ...styles.button, ...styles.primary }} disabled={busy} onClick={() => void save()}>
                        {busy ? 'Saving…' : 'Save'}
                    </button>
                ) : null}
            </div>
        </div>
    );
}

const pathFromTarget = (target: Element): string | undefined => {
    const image = target.closest('img');
    if (image !== null) {
        const src = image.getAttribute('src') ?? '';
        const direct = src.indexOf(IMAGE_MARKER);
        if (direct >= 0) return decodeURIComponent(src.slice(direct + IMAGE_MARKER.length));
        try {
            const inner = new URL(src, window.location.origin).searchParams.get('url') ?? '';
            const nested = inner.indexOf(IMAGE_MARKER);
            if (nested >= 0) return decodeURIComponent(inner.slice(nested + IMAGE_MARKER.length));
        } catch {
            return undefined;
        }
        const alt = decodePath(image.getAttribute('alt') ?? '');
        if (alt !== undefined) return alt;
    }
    let element: Element | null = target;
    while (element !== null && element !== document.body) {
        const path = decodePath(element.textContent ?? '');
        if (path !== undefined) return path;
        element = element.parentElement;
    }
    return undefined;
};

const describedFor = (fields: DescribedField[], path: string): DescribedField | undefined => {
    const exact = fields.find((field) => field.path === path);
    if (exact !== undefined) return exact;
    return fields.filter((field) => path.startsWith(`${field.path}.`)).sort((left, right) => right.path.length - left.path.length)[0];
};

const valueAt = (draft: Record<string, unknown> | null, path: string): unknown => {
    let cursor: unknown = draft;
    for (const segment of path.split('.')) {
        if (cursor === null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
};

const promptFor = (name: string): string =>
    `Fill in the ${name
        .replace(/Page$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()} page.`;

/**
 * What `KizunaPreview` renders in draft mode.
 */
export function PreviewOverlay(props: PreviewOverlayProps) {
    const api = useApi(props);
    const router = useRouter();
    const pathname = usePathname();
    const [description, setDescription] = useState<Description | undefined>();
    const [etag, setEtag] = useState<string | null>(null);
    const [failure, setFailure] = useState<string | undefined>();
    const [editing, setEditing] = useState<{ path: string; top: number; left: number } | undefined>();
    const [panel, setPanel] = useState<'none' | 'fields' | 'setup'>('none');
    const [notice, setNotice] = useState<string | undefined>();
    const overlay = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        const result = await api.call('GET', `/describe?url=${encodeURIComponent(pathname)}`);
        if (result.status === 200) {
            const described = result.body as Description;
            setDescription(described);
            setEtag(result.etag);
            setFailure(undefined);
            if (!described.complete) setPanel('setup');
        } else if (result.status === 404) {
            setDescription(undefined);
            setFailure(undefined);
        } else {
            setFailure(
                result.status === 401 || result.status === 403
                    ? 'Sign in as an editor to edit this page.'
                    : `The CMS answered ${result.status}.`
            );
        }
    }, [api, pathname]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (description === undefined) return;
        const onClick = (event: MouseEvent): void => {
            const target = event.target as Element | null;
            if (target === null || overlay.current?.contains(target)) return;
            const path = pathFromTarget(target);
            if (path === undefined) return;
            const field = describedFor(description.fields, path);
            if (field === undefined) return;
            event.preventDefault();
            event.stopPropagation();
            const rect = target.getBoundingClientRect();
            setEditing({
                path: field.path,
                top: Math.min(rect.bottom + 8, window.innerHeight - 320),
                left: Math.min(rect.left, window.innerWidth - 24 * 16),
            });
        };
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [description]);

    const save = useCallback(
        async (path: string, value: unknown): Promise<string | undefined> => {
            if (description === undefined) return 'No page to save to.';
            const result = await api.call(
                'PATCH',
                `/pages/${encodeURIComponent(description.name)}/draft`,
                {
                    changes: {
                        [path]: value,
                    },
                },
                etag === null ? {} : { 'if-match': etag }
            );
            if (result.status === 200) {
                setEtag(result.etag);
                await load();
                router.refresh();
                setNotice('Saved to the draft.');
                return undefined;
            }
            const problem = result.body as Problem;
            if (result.status === 409) return 'Someone else changed this page. Reload to see their version before editing.';
            if (result.status === 422 && problem.errors !== undefined && problem.errors.length > 0) {
                return problem.errors.map((error) => `${error.path.join('.')}: ${error.message}`).join(' ');
            }
            return problem.detail ?? `The CMS answered ${result.status}.`;
        },
        [api, description, etag, load, router]
    );

    const publish = async (): Promise<void> => {
        if (description === undefined) return;
        if (!window.confirm(`Publish ${description.name}? Everyone will see the current draft.`)) return;
        const result = await api.call('POST', `/pages/${encodeURIComponent(description.name)}/publish`, {});
        if (result.status === 200) {
            await load();
            router.refresh();
            setNotice('Published.');
        } else {
            setNotice((result.body as Problem).detail ?? `Publishing failed with ${result.status}.`);
        }
    };

    useEffect(() => {
        if (notice === undefined) return;
        const timer = window.setTimeout(() => setNotice(undefined), 4000);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const exitHref = `${props.draftPath}?disable=1&redirect=${encodeURIComponent(pathname)}`;
    const editingField =
        editing === undefined || description === undefined ? undefined : description.fields.find((field) => field.path === editing.path);
    const topLevel = description?.fields.filter((field) => field.parent === undefined) ?? [];

    return (
        <div ref={overlay} data-kizuna-cms-overlay="">
            <div style={styles.bar} role="status">
                <strong>Preview</strong>
                {description !== undefined ? (
                    <>
                        <span>{description.name}</span>
                        <span style={{ color: palette.muted }}>
                            {description.status} · v{description.version}
                        </span>
                        <button type="button" style={styles.button} onClick={() => setPanel(panel === 'fields' ? 'none' : 'fields')}>
                            Fields
                        </button>
                        <button
                            type="button"
                            style={{ ...styles.button, ...styles.primary }}
                            disabled={!description.complete || description.status === 'published'}
                            onClick={() => void publish()}>
                            Publish
                        </button>
                    </>
                ) : failure !== undefined ? (
                    <span>{failure}</span>
                ) : (
                    <span style={{ color: palette.muted }}>No CMS page here</span>
                )}
                {notice !== undefined ? <span style={{ color: palette.muted }}>{notice}</span> : null}
                <a href={exitHref} style={{ color: palette.text }}>
                    Exit
                </a>
            </div>

            {editing !== undefined && editingField !== undefined ? (
                <div
                    style={{ ...styles.popover, top: editing.top, left: editing.left }}
                    role="dialog"
                    aria-label={`Edit ${editingField.name}`}>
                    <FieldEditor
                        key={editing.path}
                        field={editingField}
                        initial={valueAt(description?.draft ?? null, editing.path)}
                        api={api}
                        onSave={save}
                        onClose={() => setEditing(undefined)}
                    />
                </div>
            ) : null}

            {panel !== 'none' && description !== undefined ? (
                <aside style={styles.panel} aria-label={panel === 'setup' ? 'Set up this page' : 'All fields'}>
                    <div style={{ ...styles.row, justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <strong>{panel === 'setup' ? 'Set up this page' : 'All fields'}</strong>
                        <button type="button" style={styles.button} onClick={() => setPanel('none')}>
                            Close
                        </button>
                    </div>
                    {panel === 'setup' ? (
                        <>
                            <p style={{ margin: '0 0 0.5rem' }}>
                                This page has no complete draft yet. Fill in {description.missing.join(', ')}, or ask an agent:
                            </p>
                            <div style={{ ...styles.row, marginBottom: '1rem' }}>
                                <code style={{ ...styles.group, flex: 1, marginTop: 0 }}>{promptFor(description.name)}</code>
                                <button
                                    type="button"
                                    style={styles.button}
                                    onClick={() => void navigator.clipboard?.writeText(promptFor(description.name))}>
                                    Copy
                                </button>
                            </div>
                        </>
                    ) : null}
                    {(panel === 'setup' ? topLevel.filter((field) => description.missing.includes(field.name)) : topLevel).map((field) => (
                        <div key={field.path} style={{ marginBottom: '1.25rem' }}>
                            <FieldEditor field={field} initial={valueAt(description.draft, field.path)} api={api} onSave={save} />
                        </div>
                    ))}
                </aside>
            ) : null}
        </div>
    );
}

export type { ReactNode };
