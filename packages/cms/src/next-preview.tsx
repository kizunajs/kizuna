'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactElement,
    type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Menu } from '@base-ui/react/menu';
import { NumberField } from '@base-ui/react/number-field';
import { Popover } from '@base-ui/react/popover';
import { Select } from '@base-ui/react/select';
import { Switch } from '@base-ui/react/switch';
import { Toggle } from '@base-ui/react/toggle';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toolbar } from '@base-ui/react/toolbar';
import { Tooltip } from '@base-ui/react/tooltip';
import {
    Bold,
    Check,
    ChevronDown,
    ChevronsUpDown,
    ChevronUp,
    CircleAlert,
    Code,
    Copy,
    Eye,
    Heading2,
    Heading3,
    ImagePlus,
    Italic,
    Link,
    List,
    ListOrdered,
    LoaderCircle,
    PanelRight,
    PenLine,
    Pilcrow,
    Plus,
    Quote,
    Search,
    Underline,
    Unlink,
    X,
} from 'lucide-react';
import {
    defineAnnotation,
    defineBlockObject,
    defineDecorator,
    defineSchema,
    defineTextBlock,
    EditorProvider,
    PortableTextEditable,
    useEditor,
    useEditorSelector,
    type BlockObjectRenderProps,
    type PortableTextBlock,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import { isActiveAnnotation, isActiveDecorator, isActiveListItem, isActiveStyle } from '@portabletext/editor/selectors';
import { decodeImageSource, decodeSource, IMAGE_MARKER, type Source } from './source-path.js';
import { parseRef } from './refs.js';
import { isRichTextJsonSchema, SAFE_HREF } from './rich-text.js';

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

type PageStatus = 'empty' | 'draft' | 'published' | 'changed';

interface UsedOn {
    everywhere: boolean;
    pages: Array<{ name: string; path: string }>;
}

interface Description {
    ref: string;
    kind: 'page' | 'global' | 'item';
    usedOn: UsedOn;
    name: string;
    path: string | null;
    status: PageStatus;
    version: number;
    complete: boolean;
    missing: string[];
    fields: DescribedField[];
    draft: Record<string, unknown> | null;
}

interface DraftBody {
    status: PageStatus;
    version: number;
    content: Record<string, unknown> | null;
    complete: boolean;
    missing: string[];
}

interface Problem {
    detail?: string;
    errors?: Array<{ path: string[]; message: string }>;
}

/**
 * Why a save did not land: one message for the form, or one per field path.
 */
interface SaveFailure {
    problem?: string;
    fieldErrors?: Record<string, string>;
}

export interface PreviewOverlayProps {
    apiPath: string;
    basePath: string;
    draftPath: string;
    signInPath?: string;
    headers?: Record<string, string>;
    /**
     * The site this app is, when several apps share the CMS.
     */
    site?: string;
}

const palette = {
    text: '#1a1a1a',
    muted: '#737373',
    subtle: '#a3a3a3',
    fill: '#f6f6f6',
    fillHover: '#ededed',
    line: '#e8e8e8',
    surface: '#ffffff',
    blue: '#0071e3',
    blueHover: '#0062c4',
    ring: 'rgba(0, 113, 227, 0.2)',
};

const font = 'Inter, system-ui, -apple-system, sans-serif';

const shadow = '0 1px 2px rgba(0, 0, 0, 0.06), 0 8px 28px rgba(0, 0, 0, 0.1)';

const LAYER = 2147483000;

/**
 * How long typing pauses before the draft saves and the page refreshes.
 */
const AUTOSAVE_DELAY = 450;

const iconSize = {
    size: 16,
    strokeWidth: 1.75,
    'aria-hidden': true,
};

const smallIcon = {
    size: 14,
    strokeWidth: 1.75,
    'aria-hidden': true,
};

/**
 * The overlay's look, scoped to its root so the page's own styles are untouched.
 * Base UI parts are unstyled and expose their state as data attributes.
 */
const STYLESHEET = `
[data-kizuna-cms-overlay] {
    font-family: ${font};
    font-size: 12px;
    line-height: 1.4;
    color: ${palette.text};
    -webkit-font-smoothing: antialiased;
}
[data-kizuna-cms-overlay] *,
[data-kizuna-cms-overlay] *::before,
[data-kizuna-cms-overlay] *::after {
    box-sizing: border-box;
}
.kcms-toolbar {
    position: fixed;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    z-index: ${LAYER};
    display: flex;
    align-items: center;
    gap: 2px;
    max-width: calc(100vw - 32px);
    padding: 4px;
    border-radius: 12px;
    background: ${palette.surface};
    box-shadow: ${shadow};
}
.kcms-switcher {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    min-width: 0;
    max-width: 320px;
    padding: 0 8px 0 12px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: ${palette.text};
    font: inherit;
    cursor: pointer;
}
.kcms-switcher:hover,
.kcms-switcher[data-popup-open] {
    background: ${palette.fill};
}
.kcms-switcher:focus-visible {
    outline: 2px solid ${palette.blue};
    outline-offset: 1px;
}
.kcms-switcher-title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.kcms-switcher-path {
    color: ${palette.muted};
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.kcms-divider {
    width: 1px;
    height: 20px;
    margin: 0 6px;
    background: ${palette.line};
    flex: none;
}
.kcms-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 0 4px;
    color: ${palette.muted};
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
}
.kcms-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    border: 1.5px solid ${palette.muted};
}
.kcms-dot[data-status='published'] {
    border-color: ${palette.text};
    background: ${palette.text};
}
.kcms-shared {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 12px 10px;
    padding: 8px 10px;
    border-radius: 8px;
    background: ${palette.fill};
    color: ${palette.muted};
    font-size: 11px;
}
.kcms-shared-title {
    color: ${palette.text};
    font-weight: 600;
}
.kcms-publish-list {
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
}
.kcms-publish-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 0;
}
.kcms-publish-note {
    color: ${palette.muted};
    font-size: 11px;
}
.kcms-menu-label {
    padding: 6px 8px 4px;
    color: ${palette.muted};
    font-size: 11px;
    font-weight: 500;
}
.kcms-segmented {
    display: flex;
    gap: 2px;
    margin-right: 2px;
    padding: 2px;
    border-radius: 8px;
    background: ${palette.fill};
}
.kcms-segment {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: ${palette.muted};
    font: inherit;
    font-weight: 500;
    cursor: pointer;
}
.kcms-segment:hover {
    color: ${palette.text};
}
.kcms-segment[data-pressed] {
    background: ${palette.surface};
    color: ${palette.text};
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08), 0 0 0 0.5px rgba(0, 0, 0, 0.04);
}
.kcms-segment:focus-visible {
    outline: 2px solid ${palette.blue};
    outline-offset: 1px;
}
.kcms-toggle[data-pressed] {
    background: ${palette.fill};
}
.kcms-tool {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: ${palette.text};
    text-decoration: none;
    cursor: pointer;
}
.kcms-tool:hover {
    background: ${palette.fill};
}
.kcms-tool[data-pressed] {
    background: ${palette.blue};
    color: #ffffff;
}
.kcms-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: ${palette.muted};
    cursor: pointer;
}
.kcms-icon:hover {
    background: ${palette.fill};
    color: ${palette.text};
}
.kcms-icon[data-active='true'] {
    background: ${palette.fillHover};
    color: ${palette.text};
}
.kcms-rich {
    border: 1px solid ${palette.line};
    border-radius: 7px;
    background: ${palette.surface};
}
.kcms-rich:focus-within {
    border-color: ${palette.blue};
    box-shadow: 0 0 0 3px ${palette.ring};
}
.kcms-rich-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border-bottom: 1px solid ${palette.line};
}
.kcms-rich-toolbar .kcms-input {
    flex: 1 0 100%;
    margin-top: 4px;
}
.kcms-rich-divider {
    width: 1px;
    height: 16px;
    margin: 0 4px;
    background: ${palette.line};
}
.kcms-rich-editable {
    min-height: 140px;
    max-height: 360px;
    overflow: auto;
    padding: 8px 10px;
    outline: none;
    line-height: 1.5;
}
.kcms-rich-editable > * {
    margin: 0 0 8px;
}
.kcms-rich-editable h2 {
    font-size: 16px;
}
.kcms-rich-editable h3,
.kcms-rich-editable h4 {
    font-size: 14px;
}
.kcms-rich-editable blockquote {
    padding-left: 10px;
    border-left: 3px solid ${palette.line};
    color: ${palette.muted};
}
.kcms-rich-editable p[data-list]::before {
    content: '•';
    margin-right: 6px;
    color: ${palette.muted};
}
.kcms-rich-editable p[data-list='number']::before {
    content: '#';
}
.kcms-rich-link {
    text-decoration: underline;
}
.kcms-rich-image img {
    display: block;
    max-width: 100%;
    max-height: 160px;
    margin-bottom: 4px;
    border-radius: 6px;
}
.kcms-rich-image[data-selected='true'] img {
    outline: 2px solid ${palette.blue};
}
.kcms-icon:disabled {
    background: transparent;
    color: #d4d4d4;
    cursor: default;
}
.kcms-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    border: none;
    border-radius: 8px;
    background: ${palette.fill};
    color: ${palette.text};
    font: inherit;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
}
.kcms-button:hover {
    background: ${palette.fillHover};
}
.kcms-ghost {
    background: transparent;
}
.kcms-primary {
    background: ${palette.blue};
    color: #ffffff;
}
.kcms-primary:hover {
    background: ${palette.blueHover};
}
.kcms-button:disabled {
    background: ${palette.fill};
    color: ${palette.subtle};
    cursor: default;
}
.kcms-kbd {
    color: ${palette.subtle};
    font: inherit;
    font-size: 11px;
}
.kcms-primary .kcms-kbd {
    color: rgba(255, 255, 255, 0.7);
}
.kcms-tool:focus-visible,
.kcms-icon:focus-visible,
.kcms-button:focus-visible,
.kcms-switch:focus-visible {
    outline: 2px solid ${palette.blue};
    outline-offset: 1px;
}
.kcms-input {
    width: 100%;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid ${palette.line};
    border-radius: 7px;
    background: ${palette.fill};
    color: ${palette.text};
    font: inherit;
}
.kcms-input::placeholder {
    color: ${palette.subtle};
}
.kcms-input:hover {
    border-color: #dcdcdc;
}
.kcms-input:focus,
.kcms-input[data-popup-open] {
    outline: none;
    border-color: ${palette.blue};
    background: ${palette.surface};
    box-shadow: 0 0 0 3px ${palette.ring};
}
.kcms-input:disabled {
    color: ${palette.muted};
    cursor: default;
}
textarea.kcms-input {
    min-height: 64px;
    padding: 6px 8px;
    resize: vertical;
    line-height: 1.45;
}
.kcms-select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    text-align: left;
    cursor: pointer;
}
.kcms-popup {
    border-radius: 12px;
    background: ${palette.surface};
    box-shadow: ${shadow};
    outline: none;
}
.kcms-menu {
    min-width: var(--anchor-width);
    max-height: min(280px, var(--available-height));
    padding: 4px;
    overflow: auto;
}
.kcms-menu-item {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 8px 0 6px;
    border-radius: 6px;
    cursor: default;
    outline: none;
}
.kcms-menu-item[data-highlighted] {
    background: ${palette.blue};
    color: #ffffff;
}
.kcms-menu-check {
    display: inline-flex;
    width: 14px;
}
.kcms-tooltip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 6px;
    background: ${palette.text};
    color: #ffffff;
    font-size: 11px;
    font-weight: 500;
}
.kcms-tooltip .kcms-kbd {
    color: #a3a3a3;
}
.kcms-switch {
    display: inline-flex;
    width: 26px;
    height: 16px;
    padding: 2px;
    border: none;
    border-radius: 999px;
    background: #d4d4d4;
    cursor: pointer;
}
.kcms-switch[data-checked] {
    background: ${palette.blue};
}
.kcms-switch-thumb {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    transition: transform 120ms ease;
}
.kcms-switch-thumb[data-checked] {
    transform: translateX(10px);
}
.kcms-row-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: ${palette.text};
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.kcms-row-button:hover,
.kcms-row-button[aria-selected='true'] {
    background: ${palette.fill};
}
.kcms-backdrop {
    position: fixed;
    inset: 0;
    z-index: ${LAYER + 2};
    background: rgba(0, 0, 0, 0.18);
}
.kcms-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: ${LAYER + 3};
    width: min(340px, calc(100vw - 32px));
    padding: 16px;
    transform: translate(-50%, -50%);
}
.kcms-spin {
    animation: kcms-spin 800ms linear infinite;
}
@keyframes kcms-spin {
    to {
        transform: rotate(360deg);
    }
}
`;

const styles: Record<string, CSSProperties> = {
    toast: {
        position: 'fixed',
        left: '50%',
        bottom: '80px',
        transform: 'translateX(-50%)',
        zIndex: LAYER,
        padding: '6px 10px',
        borderRadius: '8px',
        background: palette.text,
        color: palette.surface,
        fontSize: '12px',
        boxShadow: shadow,
    },
    panel: {
        position: 'fixed',
        top: '12px',
        right: '12px',
        bottom: '84px',
        width: 'min(288px, calc(100vw - 24px))',
        zIndex: LAYER,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        background: palette.surface,
        boxShadow: shadow,
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '40px',
        padding: '0 8px 0 14px',
        flex: 'none',
    },
    headerTitle: {
        flex: 1,
        margin: 0,
        fontSize: '12px',
        fontWeight: 600,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    scroll: {
        flex: 1,
        overflow: 'auto',
        paddingBottom: '8px',
    },
    section: {
        padding: '8px 14px 10px',
    },
    sectionTitle: {
        margin: '0 0 6px',
        fontSize: '11px',
        fontWeight: 600,
    },
    row: {
        display: 'grid',
        gridTemplateColumns: '72px minmax(0, 1fr)',
        gap: '8px',
        alignItems: 'start',
        padding: '3px 0',
    },
    rowLabel: {
        paddingTop: '6px',
        color: palette.muted,
        fontSize: '11px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
    subgroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
    },
    help: {
        margin: '4px 0 0',
        color: palette.muted,
        fontSize: '11px',
    },
    fieldError: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        margin: '4px 0 0',
        color: palette.text,
        fontSize: '11px',
        fontWeight: 500,
    },
    counter: {
        color: palette.subtle,
        fontSize: '11px',
        fontVariantNumeric: 'tabular-nums',
    },
    status: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        color: palette.muted,
        fontSize: '11px',
        whiteSpace: 'nowrap',
    },
    prompt: {
        flex: 1,
        padding: '6px 8px',
        borderRadius: '7px',
        background: palette.fill,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '11px',
    },
    item: {
        display: 'flex',
        gap: '4px',
        alignItems: 'flex-start',
        padding: '2px 0',
    },
};

const STATUS_LABELS: Record<PageStatus, string> = {
    empty: 'Not started',
    draft: 'Draft',
    published: 'Published',
    changed: 'Unpublished changes',
};

/**
 * Where the overlay's popups render, so they sit inside its scoped styles.
 */
const PortalContext = createContext<HTMLElement | null>(null);

const resolveRef = (schema: JsonSchema, root: JsonSchema): JsonSchema => {
    if (schema.$ref === undefined) return schema;
    return root.$defs?.[schema.$ref.replace('#/$defs/', '')] ?? schema;
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
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

const valueAt = (draft: unknown, path: string): unknown => {
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

interface Api {
    call: (
        method: string,
        path: string,
        body?: unknown,
        extra?: Record<string, string>
    ) => Promise<{ status: number; body: unknown; etag: string | null }>;
}

const useApi = (props: Pick<PreviewOverlayProps, 'apiPath' | 'basePath' | 'headers'>): Api =>
    useMemo(
        () => ({
            call: async (method, path, body, extra) => {
                const response = await fetch(`${props.apiPath}${props.basePath === '/' ? '' : props.basePath}${path}`, {
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

/**
 * A hint on hover, in the overlay's portal.
 */
function Hint({ label, shortcut, children }: { label: string; shortcut?: string; children: ReactElement }) {
    const portal = useContext(PortalContext);
    return (
        <Tooltip.Root>
            <Tooltip.Trigger render={children} />
            <Tooltip.Portal container={portal}>
                <Tooltip.Positioner side="top" sideOffset={8} style={{ zIndex: LAYER + 1 }}>
                    <Tooltip.Popup className="kcms-tooltip">
                        {label}
                        {shortcut !== undefined ? <kbd className="kcms-kbd">{shortcut}</kbd> : null}
                    </Tooltip.Popup>
                </Tooltip.Positioner>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

interface ControlProps {
    schema: JsonSchema;
    root: JsonSchema;
    value: unknown;
    onChange: (value: unknown) => void;
    api: Api;
    disabled: boolean;
    brand?: string;
    searchTool?: string;
    required?: boolean;
    autoFocus?: boolean;
}

function SelectControl({
    options,
    value,
    onChange,
    disabled,
    required,
}: {
    options: string[];
    value: string;
    onChange: (value: unknown) => void;
    disabled: boolean;
    required?: boolean;
}) {
    const portal = useContext(PortalContext);
    const items = options.map((option) => ({
        label: option,
        value: option,
    }));
    return (
        <Select.Root
            items={items}
            value={value === '' ? null : value}
            onValueChange={(next) => onChange(next === null ? (required === true ? '' : undefined) : next)}
            disabled={disabled}>
            <Select.Trigger className="kcms-input kcms-select">
                <Select.Value placeholder="Choose" />
                <Select.Icon style={{ display: 'flex', color: palette.muted }}>
                    <ChevronsUpDown {...smallIcon} />
                </Select.Icon>
            </Select.Trigger>
            <Select.Portal container={portal}>
                <Select.Positioner sideOffset={4} alignItemWithTrigger={false} style={{ zIndex: LAYER + 2 }}>
                    <Select.Popup className="kcms-popup kcms-menu">
                        <Select.List>
                            {items.map((item) => (
                                <Select.Item key={item.value} value={item.value} className="kcms-menu-item">
                                    <span className="kcms-menu-check">
                                        <Select.ItemIndicator>
                                            <Check {...smallIcon} />
                                        </Select.ItemIndicator>
                                    </span>
                                    <Select.ItemText>{item.label}</Select.ItemText>
                                </Select.Item>
                            ))}
                        </Select.List>
                    </Select.Popup>
                </Select.Positioner>
            </Select.Portal>
        </Select.Root>
    );
}

function StringControl({ schema, value, onChange, disabled, required, autoFocus }: ControlProps) {
    const text = typeof value === 'string' ? value : '';
    const set = (next: string): void => onChange(next === '' && required !== true ? undefined : next);
    if (schema.enum !== undefined) {
        return <SelectControl options={schema.enum.map(String)} value={text} onChange={onChange} disabled={disabled} required={required} />;
    }
    if (schema.format === 'uri') {
        const httpsOnly = schema.pattern?.includes('https') === true;
        return (
            <input
                className="kcms-input"
                type="url"
                value={text}
                disabled={disabled}
                autoFocus={autoFocus}
                placeholder={httpsOnly ? 'https://' : 'https:// or http://'}
                onChange={(event) => set(event.target.value)}
            />
        );
    }
    if (schema.format === 'date') {
        return (
            <input
                className="kcms-input"
                type="date"
                value={text}
                disabled={disabled}
                autoFocus={autoFocus}
                onChange={(event) => set(event.target.value)}
            />
        );
    }
    if (schema.format === 'date-time') {
        return (
            <input
                className="kcms-input"
                type="datetime-local"
                value={text.slice(0, 16)}
                disabled={disabled}
                autoFocus={autoFocus}
                onChange={(event) => set(event.target.value === '' ? '' : new Date(event.target.value).toISOString())}
            />
        );
    }
    const long = schema.maxLength === undefined || schema.maxLength > 120;
    const over = schema.maxLength !== undefined && text.length > schema.maxLength;
    return (
        <div style={{ position: 'relative' }}>
            {long ? (
                <textarea
                    className="kcms-input"
                    value={text}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    onChange={(event) => set(event.target.value)}
                />
            ) : (
                <input
                    className="kcms-input"
                    type="text"
                    value={text}
                    disabled={disabled}
                    autoFocus={autoFocus}
                    style={schema.maxLength === undefined ? undefined : { paddingRight: '48px' }}
                    onChange={(event) => set(event.target.value)}
                />
            )}
            {schema.maxLength !== undefined ? (
                <span
                    style={{
                        ...styles.counter,
                        position: 'absolute',
                        right: '8px',
                        ...(long ? { bottom: '6px' } : { top: '7px' }),
                        color: over ? palette.text : palette.subtle,
                        fontWeight: over ? 600 : 400,
                    }}>
                    {text.length}/{schema.maxLength}
                </span>
            ) : null}
        </div>
    );
}

function NumberControl({ schema, value, onChange, disabled }: ControlProps) {
    return (
        <NumberField.Root
            value={typeof value === 'number' ? value : null}
            onValueChange={(next) => onChange(next ?? undefined)}
            min={schema.minimum}
            max={schema.maximum}
            step={typeOf(schema) === 'integer' ? 1 : undefined}
            disabled={disabled}>
            <NumberField.Group>
                <NumberField.Input className="kcms-input" />
            </NumberField.Group>
        </NumberField.Root>
    );
}

function BooleanControl({ value, onChange, disabled }: ControlProps) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', minHeight: '28px' }}>
            <Switch.Root
                className="kcms-switch"
                checked={value === true}
                onCheckedChange={(checked) => onChange(checked)}
                disabled={disabled}>
                <Switch.Thumb className="kcms-switch-thumb" />
            </Switch.Root>
        </div>
    );
}

interface Item {
    id: string;
    label: string;
    image?: string;
}

function ReferenceControl({ value, onChange, api, brand, searchTool, disabled }: ControlProps) {
    const [query, setQuery] = useState('');
    const [items, setItems] = useState<Item[]>([]);
    const [searching, setSearching] = useState(false);
    const id = typeof value === 'string' ? value : '';
    const search = useCallback(
        async (term: string) => {
            if (brand === undefined || searchTool === undefined) return;
            const result = await api.call('GET', `/items/${encodeURIComponent(brand)}?q=${encodeURIComponent(term)}`);
            if (result.status === 200) setItems((result.body as { items: Item[] }).items);
        },
        [api, brand, searchTool]
    );
    if (searchTool === undefined || disabled) {
        return (
            <input
                className="kcms-input"
                type="text"
                value={id}
                disabled={disabled}
                placeholder={brand}
                onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value)}
            />
        );
    }
    return (
        <div style={{ position: 'relative' }}>
            <Search {...smallIcon} style={{ position: 'absolute', left: '8px', top: '7px', color: palette.subtle }} />
            <input
                className="kcms-input"
                type="search"
                style={{ paddingLeft: '28px' }}
                placeholder={id === '' ? 'Search' : id}
                value={query}
                onFocus={() => {
                    setSearching(true);
                    void search(query);
                }}
                onBlur={() => window.setTimeout(() => setSearching(false), 150)}
                onChange={(event) => {
                    setQuery(event.target.value);
                    void search(event.target.value);
                }}
            />
            {searching ? (
                <div className="kcms-popup kcms-menu" style={{ position: 'absolute', top: '32px', left: 0, right: 0, zIndex: 1 }}>
                    {items.length === 0 ? <p style={{ ...styles.help, margin: '6px 8px' }}>Nothing found</p> : null}
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className="kcms-row-button"
                            aria-selected={item.id === id}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onChange(item.id);
                                setQuery('');
                                setSearching(false);
                            }}>
                            {item.image !== undefined ? (
                                <img src={item.image} alt="" width={20} height={20} style={{ objectFit: 'cover', borderRadius: '4px' }} />
                            ) : null}
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.label}
                            </span>
                            {item.id === id ? <Check {...smallIcon} /> : null}
                        </button>
                    ))}
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

const CROP_EDGES: Array<{ key: 'x' | 'y' | 'width' | 'height'; label: string }> = [
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
 * Uploads an image through the presigned URL the CMS hands out, and returns
 * the media id once the CMS has checked the file.
 */
const uploadImage = async (api: Api, file: File): Promise<string> => {
    const created = await api.call('POST', '/media/uploads', {
        filename: file.name,
        contentType: file.type,
        size: file.size,
    });
    if (created.status !== 201) throw new Error((created.body as Problem).detail ?? 'The upload was refused.');
    const pending = created.body as { uploadId: string; url: string; headers: Record<string, string> };
    const put = await fetch(pending.url, {
        method: 'PUT',
        headers: pending.headers,
        body: file,
    });
    if (!put.ok) throw new Error(`The storage answered ${put.status}.`);
    const completed = await api.call('POST', `/media/uploads/${encodeURIComponent(pending.uploadId)}`);
    if (completed.status !== 201) throw new Error((completed.body as Problem).detail ?? 'The file was refused.');
    return (completed.body as { id: string }).id;
};

function ImageControl({ value, onChange, api, disabled }: ControlProps) {
    const ref = (value ?? {}) as ImageRef;
    const [preview, setPreview] = useState<{ url: string; width: number; height: number } | undefined>();
    const [uploading, setUploading] = useState(false);
    const [problem, setProblem] = useState<string | undefined>();
    const fileInput = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.id === undefined) {
            setPreview(undefined);
            return;
        }
        void api.call('GET', `/media/${encodeURIComponent(ref.id)}`).then((result) => {
            if (result.status === 200) setPreview(result.body as { url: string; width: number; height: number });
        });
    }, [api, ref.id]);
    const set = (patch: Partial<ImageRef>): void =>
        onChange({
            ...ref,
            alt: ref.alt ?? '',
            ...patch,
        });
    const upload = async (file: File): Promise<void> => {
        setUploading(true);
        setProblem(undefined);
        try {
            set({
                id: await uploadImage(api, file),
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
        <div style={styles.subgroup}>
            {preview !== undefined ? (
                <div style={{ position: 'relative', borderRadius: '8px', overflow: 'hidden', background: palette.fill }}>
                    <img
                        src={preview.url}
                        alt=""
                        style={{ display: 'block', width: '100%', cursor: disabled ? 'default' : 'crosshair' }}
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
                    {ref.focalPoint !== undefined ? (
                        <span
                            style={{
                                position: 'absolute',
                                left: `${ref.focalPoint.x * 100}%`,
                                top: `${ref.focalPoint.y * 100}%`,
                                width: '12px',
                                height: '12px',
                                marginLeft: '-6px',
                                marginTop: '-6px',
                                borderRadius: '50%',
                                border: '2px solid #ffffff',
                                background: palette.blue,
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
                                pointerEvents: 'none',
                            }}
                        />
                    ) : null}
                </div>
            ) : null}
            {disabled ? null : (
                <>
                    <input
                        ref={fileInput}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                        hidden
                        onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file !== undefined) void upload(file);
                            event.target.value = '';
                        }}
                    />
                    <button type="button" className="kcms-button" disabled={uploading} onClick={() => fileInput.current?.click()}>
                        {uploading ? <LoaderCircle {...smallIcon} className="kcms-spin" /> : <ImagePlus {...smallIcon} />}
                        {uploading ? 'Uploading' : ref.id === undefined ? 'Upload image' : 'Replace'}
                    </button>
                </>
            )}
            {preview !== undefined && !disabled ? (
                <p style={{ ...styles.help, marginTop: 0 }}>
                    {preview.width} × {preview.height} · click the image to set its focus
                </p>
            ) : null}
            {problem !== undefined ? (
                <p style={styles.fieldError}>
                    <CircleAlert {...smallIcon} />
                    {problem}
                </p>
            ) : null}
            <div style={styles.row}>
                <span style={styles.rowLabel}>Alt text</span>
                <input
                    className="kcms-input"
                    type="text"
                    value={ref.alt ?? ''}
                    disabled={disabled}
                    placeholder="Describe the image"
                    onChange={(event) => set({ alt: event.target.value })}
                />
            </div>
            {disabled || ref.id === undefined ? null : (
                <div style={styles.row}>
                    <span style={styles.rowLabel}>Crop</span>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '4px' }}>
                        {CROP_EDGES.map((edge) => (
                            <NumberField.Root
                                key={edge.key}
                                value={ref.crop?.[edge.key] ?? (edge.key === 'width' || edge.key === 'height' ? 1 : 0)}
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
                                            ...ref.crop,
                                            [edge.key]: next ?? 0,
                                        },
                                    })
                                }>
                                <NumberField.Group style={{ position: 'relative' }}>
                                    <span
                                        style={{ position: 'absolute', left: '6px', top: '6px', color: palette.subtle, fontSize: '11px' }}>
                                        {edge.label}
                                    </span>
                                    <NumberField.Input
                                        className="kcms-input"
                                        aria-label={`Crop ${edge.key}`}
                                        style={{ paddingLeft: '18px', paddingRight: '4px' }}
                                    />
                                </NumberField.Group>
                            </NumberField.Root>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

const move = (items: unknown[], from: number, to: number): unknown[] => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
};

function ArrayControl(props: ControlProps) {
    const { schema, root, value, onChange, disabled } = props;
    const items = Array.isArray(value) ? value : [];
    const itemSchema = schema.items ?? {};
    const max = schema.maxItems;
    const min = schema.minItems ?? 0;
    return (
        <div style={styles.subgroup}>
            {items.map((item, index) => (
                <div key={index} style={styles.item}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Control
                            {...props}
                            autoFocus={false}
                            schema={itemSchema}
                            root={root}
                            value={item}
                            required
                            onChange={(next) => onChange(items.map((existing, at) => (at === index ? next : existing)))}
                        />
                    </div>
                    {disabled ? null : (
                        <div style={{ display: 'flex', paddingTop: '2px' }}>
                            <button
                                type="button"
                                className="kcms-icon"
                                disabled={index === 0}
                                onClick={() => onChange(move(items, index, index - 1))}
                                aria-label="Move up">
                                <ChevronUp {...smallIcon} />
                            </button>
                            <button
                                type="button"
                                className="kcms-icon"
                                disabled={index === items.length - 1}
                                onClick={() => onChange(move(items, index, index + 1))}
                                aria-label="Move down">
                                <ChevronDown {...smallIcon} />
                            </button>
                            <button
                                type="button"
                                className="kcms-icon"
                                disabled={items.length <= min}
                                onClick={() => onChange(items.filter((_, at) => at !== index))}
                                aria-label="Remove">
                                <X {...smallIcon} />
                            </button>
                        </div>
                    )}
                </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                {disabled ? (
                    <span />
                ) : (
                    <button
                        type="button"
                        className="kcms-icon"
                        style={{ width: 'auto', padding: '0 6px', gap: '4px', fontSize: '11px', fontWeight: 500 }}
                        disabled={max !== undefined && items.length >= max}
                        onClick={() => onChange([...items, emptyFor(itemSchema, root)])}>
                        <Plus {...smallIcon} />
                        Add
                    </button>
                )}
                <span style={styles.counter}>
                    {items.length}
                    {max !== undefined ? `/${max}` : ''}
                </span>
            </div>
        </div>
    );
}

const RICH_TEXT_SCHEMA = defineSchema({
    decorators: [
        {
            name: 'strong',
        },
        {
            name: 'em',
        },
        {
            name: 'code',
        },
        {
            name: 'underline',
        },
    ],
    styles: [
        {
            name: 'normal',
        },
        {
            name: 'h2',
        },
        {
            name: 'h3',
        },
        {
            name: 'h4',
        },
        {
            name: 'blockquote',
        },
    ],
    lists: [
        {
            name: 'bullet',
        },
        {
            name: 'number',
        },
    ],
    annotations: [
        {
            name: 'link',
            fields: [
                {
                    name: 'href',
                    type: 'string',
                },
            ],
        },
    ],
    blockObjects: [
        {
            name: 'image',
            fields: [
                {
                    name: 'image',
                    type: 'object',
                },
            ],
        },
    ],
    inlineObjects: [],
});

/**
 * The api the image blocks inside the editor read their previews from.
 */
const RichTextApiContext = createContext<Api | null>(null);

function RichTextImageBlock(props: BlockObjectRenderProps) {
    const api = useContext(RichTextApiContext);
    const editor = useEditor();
    const image = (props.node as { image?: { id?: string; alt?: string } }).image ?? {};
    const [preview, setPreview] = useState<string | undefined>();
    useEffect(() => {
        if (api === null || image.id === undefined) return;
        void api.call('GET', `/media/${encodeURIComponent(image.id)}`).then((result) => {
            if (result.status === 200) setPreview((result.body as { url: string }).url);
        });
    }, [api, image.id]);
    return (
        <div {...props.attributes} className="kcms-rich-image" data-selected={props.selected}>
            {props.children}
            <div contentEditable={false}>
                {preview !== undefined ? <img src={preview} alt="" /> : null}
                <input
                    className="kcms-input"
                    placeholder="Alt text: what the image shows"
                    defaultValue={image.alt ?? ''}
                    disabled={props.readOnly}
                    onKeyDown={(event) => event.stopPropagation()}
                    onBlur={(event) =>
                        editor.send({
                            type: 'block.set',
                            at: [
                                {
                                    _key: props.node._key,
                                },
                            ],
                            props: {
                                image: {
                                    ...image,
                                    alt: event.target.value,
                                },
                            },
                        })
                    }
                />
            </div>
        </div>
    );
}

const RICH_TEXT_NODES = [
    defineTextBlock({
        type: 'block',
        render: ({ attributes, children, node }) => {
            if (node.style === 'h2') return <h2 {...attributes}>{children}</h2>;
            if (node.style === 'h3') return <h3 {...attributes}>{children}</h3>;
            if (node.style === 'h4') return <h4 {...attributes}>{children}</h4>;
            if (node.style === 'blockquote') return <blockquote {...attributes}>{children}</blockquote>;
            return (
                <p {...attributes} data-list={node.listItem}>
                    {children}
                </p>
            );
        },
    }),
    defineDecorator({
        type: 'strong',
        render: ({ children }) => <strong>{children}</strong>,
    }),
    defineDecorator({
        type: 'em',
        render: ({ children }) => <em>{children}</em>,
    }),
    defineDecorator({
        type: 'code',
        render: ({ children }) => <code>{children}</code>,
    }),
    defineDecorator({
        type: 'underline',
        render: ({ children }) => <u>{children}</u>,
    }),
    defineAnnotation({
        type: 'link',
        render: ({ children }) => <span className="kcms-rich-link">{children}</span>,
    }),
    defineBlockObject({
        type: 'image',
        render: (props) => <RichTextImageBlock {...props} />,
    }),
];

function RichTextButton(props: { label: string; active: boolean; onPress: () => void; children: ReactNode }) {
    return (
        <Hint label={props.label}>
            <button
                type="button"
                className="kcms-icon"
                aria-label={props.label}
                aria-pressed={props.active}
                data-active={props.active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={props.onPress}>
                {props.children}
            </button>
        </Hint>
    );
}

function RichTextToolbar({ api, disabled }: { api: Api; disabled: boolean }) {
    const editor = useEditor();
    const style = (name: string) => () => {
        editor.send({
            type: 'style.toggle',
            style: name,
        });
        editor.send({
            type: 'focus',
        });
    };
    const decorator = (name: string) => () => {
        editor.send({
            type: 'decorator.toggle',
            decorator: name,
        });
        editor.send({
            type: 'focus',
        });
    };
    const list = (name: string) => () => {
        editor.send({
            type: 'list item.toggle',
            listItem: name,
        });
        editor.send({
            type: 'focus',
        });
    };
    const h2 = useEditorSelector(editor, isActiveStyle('h2'));
    const h3 = useEditorSelector(editor, isActiveStyle('h3'));
    const quote = useEditorSelector(editor, isActiveStyle('blockquote'));
    const strong = useEditorSelector(editor, isActiveDecorator('strong'));
    const em = useEditorSelector(editor, isActiveDecorator('em'));
    const code = useEditorSelector(editor, isActiveDecorator('code'));
    const underline = useEditorSelector(editor, isActiveDecorator('underline'));
    const bullet = useEditorSelector(editor, isActiveListItem('bullet'));
    const number = useEditorSelector(editor, isActiveListItem('number'));
    const linked = useEditorSelector(editor, isActiveAnnotation('link'));
    const [linking, setLinking] = useState(false);
    const [href, setHref] = useState('');
    const [problem, setProblem] = useState<string | undefined>();
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);
    if (disabled) return null;
    const addLink = (): void => {
        if (!SAFE_HREF.test(href)) {
            setProblem('Links go to https://, http://, mailto:, tel:, a path like /blog, or #anchor.');
            return;
        }
        editor.send({
            type: 'annotation.add',
            annotation: {
                name: 'link',
                value: {
                    href,
                },
            },
        });
        editor.send({
            type: 'focus',
        });
        setLinking(false);
        setHref('');
        setProblem(undefined);
    };
    const insertImage = async (file: File): Promise<void> => {
        setUploading(true);
        setProblem(undefined);
        try {
            const id = await uploadImage(api, file);
            editor.send({
                type: 'insert.block object',
                placement: 'auto',
                blockObject: {
                    name: 'image',
                    value: {
                        image: {
                            id,
                            alt: '',
                        },
                    },
                },
            });
        } catch (error) {
            setProblem(error instanceof Error ? error.message : String(error));
        } finally {
            setUploading(false);
        }
    };
    return (
        <div className="kcms-rich-toolbar">
            <RichTextButton label="Paragraph" active={!h2 && !h3 && !quote} onPress={style('normal')}>
                <Pilcrow {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Heading" active={h2} onPress={style('h2')}>
                <Heading2 {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Subheading" active={h3} onPress={style('h3')}>
                <Heading3 {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Quote" active={quote} onPress={style('blockquote')}>
                <Quote {...smallIcon} />
            </RichTextButton>
            <span className="kcms-rich-divider" />
            <RichTextButton label="Bold" active={strong} onPress={decorator('strong')}>
                <Bold {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Italic" active={em} onPress={decorator('em')}>
                <Italic {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Underline" active={underline} onPress={decorator('underline')}>
                <Underline {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Code" active={code} onPress={decorator('code')}>
                <Code {...smallIcon} />
            </RichTextButton>
            <span className="kcms-rich-divider" />
            <RichTextButton label="Bulleted list" active={bullet} onPress={list('bullet')}>
                <List {...smallIcon} />
            </RichTextButton>
            <RichTextButton label="Numbered list" active={number} onPress={list('number')}>
                <ListOrdered {...smallIcon} />
            </RichTextButton>
            <span className="kcms-rich-divider" />
            {linked ? (
                <RichTextButton
                    label="Remove link"
                    active={false}
                    onPress={() =>
                        editor.send({
                            type: 'annotation.remove',
                            annotation: {
                                name: 'link',
                            },
                        })
                    }>
                    <Unlink {...smallIcon} />
                </RichTextButton>
            ) : (
                <RichTextButton label="Link" active={linking} onPress={() => setLinking(!linking)}>
                    <Link {...smallIcon} />
                </RichTextButton>
            )}
            <RichTextButton label="Image" active={false} onPress={() => fileInput.current?.click()}>
                {uploading ? <LoaderCircle {...smallIcon} className="kcms-spin" /> : <ImagePlus {...smallIcon} />}
            </RichTextButton>
            <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp,image/avif"
                hidden
                onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file !== undefined) void insertImage(file);
                    event.target.value = '';
                }}
            />
            {linking ? (
                <input
                    className="kcms-input"
                    autoFocus
                    placeholder="https://, /path or mailto:"
                    value={href}
                    onChange={(event) => setHref(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            addLink();
                        }
                        if (event.key === 'Escape') setLinking(false);
                    }}
                />
            ) : null}
            {problem !== undefined ? (
                <p style={styles.fieldError}>
                    <CircleAlert {...smallIcon} />
                    {problem}
                </p>
            ) : null}
        </div>
    );
}

/**
 * Rich text, edited as the Portable Text it is stored as.
 */
function RichTextControl({ value, onChange, api, disabled }: ControlProps) {
    return (
        <RichTextApiContext.Provider value={api}>
            <EditorProvider
                initialConfig={{
                    schemaDefinition: RICH_TEXT_SCHEMA,
                    initialValue: Array.isArray(value) ? (value as PortableTextBlock[]) : undefined,
                    readOnly: disabled,
                }}>
                <EventListenerPlugin
                    on={(event) => {
                        if (event.type === 'mutation') onChange(event.value);
                    }}
                />
                <NodePlugin nodes={RICH_TEXT_NODES} />
                <div className="kcms-rich">
                    <RichTextToolbar api={api} disabled={disabled} />
                    <PortableTextEditable className="kcms-rich-editable" />
                </div>
            </EditorProvider>
        </RichTextApiContext.Provider>
    );
}

function Control(props: ControlProps) {
    const resolved = resolveRef(props.schema, props.root);
    if (isRichTextJsonSchema(props.schema) || isRichTextJsonSchema(resolved)) return <RichTextControl {...props} schema={resolved} />;
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
            return <ObjectRows {...props} schema={resolved} />;
        default:
            return (
                <div>
                    <pre style={{ ...styles.prompt, margin: 0, overflow: 'auto' }}>{JSON.stringify(props.value, null, 2)}</pre>
                    <p style={styles.help}>No input for this value yet. Change it through an agent.</p>
                </div>
            );
    }
}

/**
 * An object's properties, a labelled row each, editing the object as a whole.
 */
function ObjectRows(props: ControlProps) {
    const current = (props.value ?? {}) as Record<string, unknown>;
    return (
        <div style={styles.subgroup}>
            {Object.entries(props.schema.properties ?? {}).map(([key, property], index) => (
                <div key={key} style={styles.row}>
                    <span style={styles.rowLabel}>{humanize(key)}</span>
                    <div>
                        <Control
                            {...props}
                            autoFocus={props.autoFocus === true && index === 0}
                            schema={property}
                            brand={undefined}
                            searchTool={undefined}
                            value={current[key]}
                            required={props.schema.required?.includes(key)}
                            onChange={(next) => {
                                const updated = {
                                    ...current,
                                };
                                if (next === undefined) delete updated[key];
                                else updated[key] = next;
                                props.onChange(updated);
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

const refusalFor = (field: DescribedField): string =>
    field.readOnly ? 'Read only' : `Only ${(field.roles ?? ['another role']).join(' or ')} can change this`;

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

function SaveStatus({ state }: { state: SaveState }) {
    if (state === 'idle') return null;
    return (
        <span style={styles.status} role="status">
            {state === 'saving' || state === 'pending' ? <LoaderCircle {...smallIcon} className="kcms-spin" /> : null}
            {state === 'saved' ? <Check {...smallIcon} /> : null}
            {state === 'failed' ? <CircleAlert {...smallIcon} /> : null}
            {state === 'failed' ? 'Not saved' : state === 'saved' ? 'Saved' : 'Saving'}
        </span>
    );
}

interface FieldFormProps {
    fields: DescribedField[];
    described: DescribedField[];
    draft: Record<string, unknown> | null;
    api: Api;
    onSave: (changes: Record<string, unknown>) => Promise<SaveFailure | undefined>;
    onState: (state: SaveState) => void;
    variant: 'popover' | 'panel';
    intro?: ReactNode;
}

/**
 * Fields as a properties panel: a section per field and a row per value. Every
 * change saves to the draft a moment after typing stops, and the page
 * refreshes to show it.
 */
function FieldForm({ fields, described, draft, api, onSave, onState, variant, intro }: FieldFormProps) {
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [problem, setProblem] = useState<string | undefined>();
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const pending = useRef<Record<string, unknown>>({});
    const saving = useRef(false);
    const timer = useRef<number | undefined>(undefined);
    const latestSave = useRef(onSave);
    latestSave.current = onSave;
    const latestState = useRef(onState);
    latestState.current = onState;

    const flush = useCallback(async (): Promise<void> => {
        window.clearTimeout(timer.current);
        if (saving.current) return;
        const sending = pending.current;
        if (Object.keys(sending).length === 0) return;
        pending.current = {};
        saving.current = true;
        latestState.current('saving');
        const failure = await latestSave.current(sending);
        saving.current = false;
        if (failure === undefined) {
            setProblem(undefined);
            setFieldErrors({});
            setValues((previous) => {
                const next = {
                    ...previous,
                };
                for (const [path, value] of Object.entries(sending)) {
                    if (next[path] === value && !(path in pending.current)) delete next[path];
                }
                return next;
            });
        } else {
            setProblem(failure.problem);
            setFieldErrors(failure.fieldErrors ?? {});
        }
        if (Object.keys(pending.current).length > 0) {
            void flush();
            return;
        }
        latestState.current(failure === undefined ? 'saved' : 'failed');
    }, []);

    useEffect(
        () => () => {
            void flush();
        },
        [flush]
    );

    const valueOf = (path: string): unknown => (path in values ? values[path] : valueAt(draft, path));
    const change = (path: string, value: unknown): void => {
        setValues((previous) => ({
            ...previous,
            [path]: value,
        }));
        pending.current = {
            ...pending.current,
            [path]: value,
        };
        latestState.current('pending');
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY);
    };
    const errorFor = (path: string): string | undefined =>
        Object.entries(fieldErrors).find(([errorPath]) => errorPath === path || errorPath.startsWith(`${path}.`))?.[1];

    const control = (field: DescribedField, writable: boolean, focus: boolean): ReactNode => (
        <>
            <Control
                schema={field.schema}
                root={field.schema}
                value={valueOf(field.path)}
                onChange={(value) => change(field.path, value)}
                api={api}
                disabled={!writable}
                brand={field.brand}
                searchTool={field.searchTool}
                autoFocus={focus}
                required
            />
            {errorFor(field.path) !== undefined ? (
                <p style={styles.fieldError} role="alert">
                    <CircleAlert {...smallIcon} />
                    {errorFor(field.path)}
                </p>
            ) : null}
            {field.description !== undefined ? <p style={styles.help}>{field.description}</p> : null}
            {writable ? null : <p style={styles.help}>{refusalFor(field)}</p>}
        </>
    );

    const section = (field: DescribedField, index: number): ReactNode => {
        const children = described.filter((candidate) => candidate.parent === field.path);
        const focus = variant === 'popover' && index === 0;
        return (
            <section key={field.path} style={variant === 'panel' ? styles.section : undefined}>
                {variant === 'panel' ? <h3 style={styles.sectionTitle}>{field.label ?? humanize(field.name)}</h3> : null}
                {children.length === 0 ? (
                    control(field, field.writable, focus)
                ) : (
                    <div style={styles.subgroup}>
                        {children.map((child, childIndex) => (
                            <div key={child.path} style={styles.row}>
                                <span style={styles.rowLabel} title={child.label ?? humanize(child.name)}>
                                    {child.label ?? humanize(child.name)}
                                </span>
                                <div>{control(child, child.writable && field.writable, focus && childIndex === 0)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        );
    };

    return (
        <div style={variant === 'panel' ? styles.scroll : { padding: '0 12px 12px' }}>
            {intro}
            {fields.map(section)}
            {problem !== undefined ? (
                <p style={{ ...styles.fieldError, margin: variant === 'panel' ? '4px 14px' : '8px 0 0' }} role="alert">
                    <CircleAlert {...smallIcon} />
                    {problem}
                </p>
            ) : null}
        </div>
    );
}

const imageSource = (image: Element): Source | undefined => {
    const src = image.getAttribute('src') ?? '';
    const direct = src.indexOf(IMAGE_MARKER);
    if (direct >= 0) return decodeImageSource(src.slice(direct + IMAGE_MARKER.length));
    try {
        // next/image passes the source through its loader as `?url=`.
        const inner = new URL(src, window.location.origin).searchParams.get('url') ?? '';
        const nested = inner.indexOf(IMAGE_MARKER);
        if (nested >= 0) return decodeImageSource(inner.slice(nested + IMAGE_MARKER.length));
    } catch {
        return undefined;
    }
    return decodeSource(image.getAttribute('alt') ?? '');
};

const MARKED_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'value'];

/**
 * Every element that holds a value itself, with the document and field it came
 * from: the parent of a text node carrying a source, an element with one in an
 * attribute, or an image. An element only containing marked children is not
 * marked, so a click on empty space finds nothing.
 */
const markedElements = (root: Element, skip: Element | null): Map<Element, Source> => {
    const marked = new Map<Element, Source>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null || skip?.contains(parent) === true || marked.has(parent)) continue;
        const source = decodeSource(node.nodeValue ?? '');
        if (source !== undefined) marked.set(parent, source);
    }
    for (const element of root.querySelectorAll('img, [placeholder], [aria-label], [title], [value]')) {
        if (skip?.contains(element) === true || marked.has(element)) continue;
        const source =
            element.tagName === 'IMG'
                ? imageSource(element)
                : MARKED_ATTRIBUTES.map((name) => decodeSource(element.getAttribute(name) ?? '')).find((found) => found !== undefined);
        if (source !== undefined) marked.set(element, source);
    }
    return marked;
};

/**
 * The nearest element from the target up that holds a value, with its source.
 */
const fieldElementFor = (target: Element, marked: Map<Element, Source>): { element: Element; source: Source } | undefined => {
    for (let element: Element | null = target; element !== null && element !== document.body; element = element.parentElement) {
        const source = marked.get(element);
        if (source !== undefined) {
            return {
                element,
                source,
            };
        }
    }
    return undefined;
};

/**
 * The element on the page that now shows a field, after a refresh replaced the
 * one that was clicked.
 */
const elementShowing = (ref: string, path: string, pageRef: string | undefined, skip: Element | null): Element | undefined => {
    for (const [element, source] of markedElements(document.body, skip)) {
        if ((source.ref ?? pageRef) !== ref) continue;
        if (source.path === path || source.path.startsWith(`${path}.`)) return element;
    }
    return undefined;
};

/**
 * Where a document's editing routes live.
 */
const routeOf = (ref: string): string => {
    const parsed = parseRef(ref);
    if (parsed === undefined) return '';
    if (parsed.type === 'page') {
        return parsed.site === undefined
            ? `/pages/${encodeURIComponent(parsed.name)}`
            : `/sites/${encodeURIComponent(parsed.site)}/pages/${encodeURIComponent(parsed.name)}`;
    }
    if (parsed.type === 'global') return `/globals/${encodeURIComponent(parsed.name)}`;
    return `/collections/${encodeURIComponent(parsed.collection)}/items/${encodeURIComponent(parsed.id)}`;
};

/**
 * What a shared document is called in the editor: its collection and the
 * first text it holds, or the global's name.
 */
const documentLabel = (document: Description): string => {
    const parsed = parseRef(document.ref);
    if (parsed?.type === 'global') return `${humanize(parsed.name)} (site-wide)`;
    if (parsed?.type === 'item') {
        const text = document.fields.map((field) => field.value).find((value) => typeof value === 'string' && value !== '');
        return `${humanize(parsed.collection)}: ${typeof text === 'string' ? text : 'Untitled'}`;
    }
    return document.path ?? humanize(document.name);
};

const isPending = (document: Description): boolean => document.complete && (document.status === 'draft' || document.status === 'changed');

const describedFor = (fields: DescribedField[], path: string): DescribedField | undefined => {
    const exact = fields.find((field) => field.path === path);
    if (exact !== undefined) return exact;
    return fields.filter((field) => path.startsWith(`${field.path}.`)).sort((left, right) => right.path.length - left.path.length)[0];
};

/**
 * Events a click or a press on the page sends, held back while editing so a
 * link, a button or a form never acts.
 */
const HELD_EVENTS = ['dblclick', 'auxclick', 'submit', 'pointerup', 'mouseup'];

const MODE_KEY = 'kizuna-cms:mode';

/**
 * Browse until the editor picks Edit, and keep their pick for the tab.
 */
const storedMode = (): 'edit' | 'interact' => {
    try {
        return window.sessionStorage.getItem(MODE_KEY) === 'edit' ? 'edit' : 'interact';
    } catch {
        return 'interact';
    }
};

const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

interface Box {
    top: number;
    left: number;
    width: number;
    height: number;
}

/**
 * The outline around a field on the page, with its name in a tag above it.
 */
function Outline({ box, label, strong }: { box: Box; label: string; strong: boolean }) {
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                top: box.top - 2,
                left: box.left - 2,
                width: box.width + 4,
                height: box.height + 4,
                zIndex: LAYER - 1,
                border: `${strong ? 2 : 1.5}px solid ${palette.blue}`,
                borderRadius: '3px',
                pointerEvents: 'none',
            }}>
            <span
                style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '-1.5px',
                    marginBottom: '2px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: palette.blue,
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 600,
                    lineHeight: '14px',
                    whiteSpace: 'nowrap',
                }}>
                {label}
            </span>
        </div>
    );
}

const boxOf = (element: Element): Box => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
    };
};

/**
 * The overlay that has claimed the page. `KizunaPreview` sits in the root layout
 * and in `not-found.tsx`, and a 404 inside the layout renders both.
 */
let owner: symbol | undefined;

/**
 * What `KizunaPreview` renders in draft mode. It mounts in the browser only,
 * and only the first one on the page shows.
 */
export function PreviewOverlay(props: PreviewOverlayProps) {
    const [active, setActive] = useState(false);
    useEffect(() => {
        if (owner !== undefined) return;
        const claim = Symbol('kizuna-cms-overlay');
        owner = claim;
        setActive(true);
        return () => {
            if (owner === claim) owner = undefined;
        };
    }, []);
    return active ? <Overlay {...props} /> : null;
}

/**
 * The page's title as a visitor sees it in the tab, kept current as the page
 * refreshes or navigates.
 */
const useDocumentTitle = (): string => {
    const [title, setTitle] = useState('');
    useEffect(() => {
        const read = (): void => setTitle(document.title.trim());
        read();
        const observer = new MutationObserver(read);
        observer.observe(document.head, {
            subtree: true,
            childList: true,
            characterData: true,
        });
        return () => observer.disconnect();
    }, []);
    return title;
};

function Overlay(props: PreviewOverlayProps) {
    const api = useApi(props);
    const documentTitle = useDocumentTitle();
    const router = useRouter();
    const pathname = usePathname();
    const [description, setDescription] = useState<Description | undefined>();
    const [documents, setDocuments] = useState<Record<string, Description>>({});
    const [onPage, setOnPage] = useState<string[]>([]);
    const [failure, setFailure] = useState<string | undefined>();
    const [mode, setMode] = useState(storedMode);
    const [editing, setEditing] = useState<{ ref: string; path: string; element: Element } | undefined>();
    const [selected, setSelected] = useState<Box | undefined>();
    const [panelOpen, setPanelOpen] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [publishing, setPublishing] = useState(false);
    const [notice, setNotice] = useState<string | undefined>();
    const [hover, setHover] = useState<{ element: Element; box: Box; label: string } | undefined>();
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const [pages, setPages] = useState<Array<{ name: string; ref: string; path: string; status: PageStatus }>>([]);
    const etags = useRef<Record<string, string | null>>({});
    const requested = useRef(new Set<string>());
    const pageRef = description?.ref;

    const documentOf = useCallback(
        (ref: string | undefined): Description | undefined =>
            ref === undefined ? undefined : ref === pageRef ? description : documents[ref],
        [description, documents, pageRef]
    );

    const load = useCallback(async () => {
        const result = await api.call(
            'GET',
            `/describe?url=${encodeURIComponent(pathname)}${props.site === undefined ? '' : `&site=${encodeURIComponent(props.site)}`}`
        );
        if (result.status === 200) {
            const described = result.body as Description;
            setDescription(described);
            etags.current[described.ref] = result.etag;
            setFailure(undefined);
            if (!described.complete) setPanelOpen(true);
        } else if (result.status === 404) {
            setDescription(undefined);
            setFailure(undefined);
        } else {
            setDescription(undefined);
            setFailure(result.status === 401 || result.status === 403 ? 'signed-out' : `The CMS answered ${result.status}`);
        }
    }, [api, pathname, props.site]);

    const describe = useCallback(
        async (ref: string): Promise<void> => {
            const result = await api.call('GET', `/describe?ref=${encodeURIComponent(ref)}`);
            if (result.status !== 200) return;
            etags.current[ref] = result.etag;
            setDocuments((previous) => ({
                ...previous,
                [ref]: result.body as Description,
            }));
        },
        [api]
    );

    useEffect(() => {
        void load();
    }, [load]);

    const loadPages = useCallback(async () => {
        if (failure === 'signed-out') return;
        const result = await api.call('GET', '/pages');
        if (result.status === 200)
            setPages(
                (
                    result.body as { pages: Array<{ name: string; site: string; ref: string; path: string; status: PageStatus }> }
                ).pages.filter((page) => page.site === (props.site ?? 'default'))
            );
    }, [api, failure, props.site]);

    useEffect(() => {
        void loadPages();
    }, [loadPages]);

    useEffect(() => {
        setEditing(undefined);
        setDocuments({});
        requested.current = new Set();
    }, [pathname]);

    // Find the globals and items the page shows, as it renders and refreshes.
    useEffect(() => {
        if (failure === 'signed-out') {
            setOnPage([]);
            return;
        }
        let timer = 0;
        const scan = (): void => {
            const refs = new Set<string>();
            for (const source of markedElements(document.body, root).values()) {
                if (source.ref !== undefined && source.ref !== pageRef) refs.add(source.ref);
            }
            const found = [...refs].sort();
            setOnPage((previous) => (previous.join() === found.join() ? previous : found));
            for (const ref of found) {
                if (requested.current.has(ref)) continue;
                requested.current.add(ref);
                void describe(ref);
            }
        };
        scan();
        const observer = new MutationObserver(() => {
            window.clearTimeout(timer);
            timer = window.setTimeout(scan, 250);
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
        });
        return () => {
            observer.disconnect();
            window.clearTimeout(timer);
        };
    }, [describe, failure, pageRef, root]);

    useEffect(() => {
        try {
            window.sessionStorage.setItem(MODE_KEY, mode);
        } catch {
            // Storage can be blocked; the mode then lasts until the page reloads.
        }
    }, [mode]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent): void => {
            if (isTyping(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === 'v' || event.key === 'V') setMode('edit');
            if (event.key === 'i' || event.key === 'I') {
                setMode('interact');
                setEditing(undefined);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Only what this editor may open is outlined or takes a click: a document the CMS described to them.
    const editable = failure !== 'signed-out' && (description !== undefined || onPage.some((ref) => documents[ref] !== undefined));

    useEffect(() => {
        if (mode !== 'edit' || !editable) {
            setHover(undefined);
            return;
        }
        const onThePage = (target: EventTarget | null): target is Element => target instanceof Element && root?.contains(target) !== true;
        const fieldAt = (target: Element) => {
            const found = fieldElementFor(target, markedElements(document.body, root));
            if (found === undefined) return undefined;
            const ref = found.source.ref ?? pageRef;
            if (ref === undefined) return undefined;
            const owner = documentOf(ref);
            if (owner === undefined) return undefined;
            const field = describedFor(owner.fields, found.source.path);
            return {
                element: found.element,
                ref,
                path: field?.path ?? found.source.path,
                field,
            };
        };
        // Only a field is taken over, so links, buttons and Next's error overlay keep working around it.
        const onAField = (target: EventTarget | null): target is Element => onThePage(target) && fieldAt(target) !== undefined;
        const hold = (event: Event): void => {
            if (!onAField(event.target)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        };
        // A press keeps a field from focusing or selecting, and still reaches the popups so they can close.
        const press = (event: Event): void => {
            if (onAField(event.target)) event.preventDefault();
        };
        const click = (event: MouseEvent): void => {
            if (!onThePage(event.target)) return;
            const found = fieldAt(event.target);
            if (found === undefined) {
                setEditing(undefined);
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            setEditing({
                ref: found.ref,
                path: found.path,
                element: found.element,
            });
        };
        const move = (event: MouseEvent): void => {
            const found = onThePage(event.target) ? fieldAt(event.target) : undefined;
            setHover(
                found === undefined
                    ? undefined
                    : {
                          element: found.element,
                          box: boxOf(found.element),
                          label:
                              found.field === undefined
                                  ? humanize(found.path.split('.')[0] ?? '')
                                  : (found.field.label ?? humanize(found.field.name)),
                      }
            );
        };
        // The outline follows its field while the page scrolls under the pointer.
        const follow = (): void =>
            setHover((previous) =>
                previous === undefined || !previous.element.isConnected
                    ? undefined
                    : {
                          ...previous,
                          box: boxOf(previous.element),
                      }
            );
        document.addEventListener('click', click, true);
        for (const type of HELD_EVENTS) document.addEventListener(type, hold, true);
        document.addEventListener('pointerdown', press, true);
        document.addEventListener('mousedown', press, true);
        document.addEventListener('mouseover', move, true);
        window.addEventListener('scroll', follow, true);
        return () => {
            document.removeEventListener('click', click, true);
            for (const type of HELD_EVENTS) document.removeEventListener(type, hold, true);
            document.removeEventListener('pointerdown', press, true);
            document.removeEventListener('mousedown', press, true);
            document.removeEventListener('mouseover', move, true);
            window.removeEventListener('scroll', follow, true);
        };
    }, [mode, editable, root, pageRef, documentOf]);

    // Follow the edited element as the page scrolls and refreshes around it.
    useEffect(() => {
        if (editing === undefined) {
            setSelected(undefined);
            return;
        }
        let frame = 0;
        let element = editing.element;
        const track = (): void => {
            if (!element.isConnected) element = elementShowing(editing.ref, editing.path, pageRef, root) ?? element;
            const next = boxOf(element);
            setSelected((previous) =>
                previous !== undefined &&
                previous.top === next.top &&
                previous.left === next.left &&
                previous.width === next.width &&
                previous.height === next.height
                    ? previous
                    : next
            );
            frame = window.requestAnimationFrame(track);
        };
        track();
        return () => window.cancelAnimationFrame(frame);
    }, [editing, pageRef, root]);

    useEffect(() => {
        if (notice === undefined) return;
        const timer = window.setTimeout(() => setNotice(undefined), 2400);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const saveTo = useCallback(
        (ref: string) =>
            async (changes: Record<string, unknown>): Promise<SaveFailure | undefined> => {
                const etag = etags.current[ref] ?? null;
                const result = await api.call(
                    'PATCH',
                    `${routeOf(ref)}/draft`,
                    {
                        changes,
                        autosave: true,
                    },
                    etag === null
                        ? {}
                        : {
                              'if-match': etag,
                          }
                );
                if (result.status === 200) {
                    etags.current[ref] = result.etag;
                    const body = result.body as DraftBody;
                    const apply = (previous: Description): Description => ({
                        ...previous,
                        draft: body.content,
                        status: body.status,
                        version: body.version,
                        complete: body.complete,
                        missing: body.missing,
                        fields: previous.fields.map((field) => ({
                            ...field,
                            value: valueAt(body.content, field.path),
                        })),
                    });
                    if (ref === pageRef) setDescription((previous) => (previous === undefined ? previous : apply(previous)));
                    else {
                        setDocuments((previous) =>
                            previous[ref] === undefined
                                ? previous
                                : {
                                      ...previous,
                                      [ref]: apply(previous[ref]),
                                  }
                        );
                    }
                    router.refresh();
                    return undefined;
                }
                const problem = result.body as Problem;
                if (result.status === 409) return { problem: 'Someone else changed this. Reload to get their version.' };
                if (result.status === 422 && problem.errors !== undefined && problem.errors.length > 0) {
                    return {
                        fieldErrors: Object.fromEntries(problem.errors.map((error) => [error.path.join('.'), error.message])),
                    };
                }
                return { problem: problem.detail ?? `The CMS answered ${result.status}` };
            },
        [api, pageRef, router]
    );

    const pending = [
        ...(description !== undefined && isPending(description) ? [description] : []),
        ...onPage.map((ref) => documents[ref]).filter((document): document is Description => document !== undefined && isPending(document)),
    ];

    const publishAll = async (): Promise<void> => {
        setPublishing(true);
        const failed: string[] = [];
        for (const document of pending) {
            const result = await api.call('POST', `${routeOf(document.ref)}/publish`, {});
            if (result.status !== 200) failed.push((result.body as Problem).detail ?? documentLabel(document));
        }
        setPublishing(false);
        setConfirming(false);
        await load();
        for (const ref of onPage) void describe(ref);
        void loadPages();
        router.refresh();
        setNotice(failed.length === 0 ? 'Published' : `Not published: ${failed.join(', ')}`);
    };

    const anchor = useMemo(() => {
        if (editing === undefined) return null;
        let element = editing.element;
        return {
            contextElement: editing.element,
            getBoundingClientRect: () => {
                if (!element.isConnected) element = elementShowing(editing.ref, editing.path, pageRef, root) ?? element;
                return element.getBoundingClientRect();
            },
        };
    }, [editing, pageRef, root]);

    const exitHref = `${props.draftPath}?disable=1&redirect=${encodeURIComponent(pathname)}`;
    const editingDocument = editing === undefined ? undefined : documentOf(editing.ref);
    const editingField =
        editing === undefined || editingDocument === undefined
            ? undefined
            : editingDocument.fields.find((field) => field.path === editing.path);
    const topLevel = description?.fields.filter((field) => field.parent === undefined) ?? [];
    const pageLabel = description === undefined ? '' : humanize(description.name);
    const pageTitle = documentTitle !== '' ? documentTitle : description === undefined ? 'This page' : pageLabel;
    const otherPages = editingDocument?.usedOn.pages.filter((used) => used.path !== pathname) ?? [];

    return (
        <div ref={setRoot} data-kizuna-cms-overlay="">
            <style>{STYLESHEET}</style>
            <PortalContext.Provider value={root}>
                <Tooltip.Provider delay={500}>
                    {hover !== undefined && editing === undefined ? <Outline box={hover.box} label={hover.label} strong={false} /> : null}
                    {selected !== undefined && editingField !== undefined ? (
                        <Outline box={selected} label={editingField.label ?? humanize(editingField.name)} strong />
                    ) : null}

                    {failure === 'signed-out' ? (
                        <Toolbar.Root className="kcms-toolbar" aria-label="Preview">
                            <span className="kcms-status" style={{ paddingLeft: '10px' }}>
                                Signed out
                            </span>
                            {props.signInPath !== undefined ? (
                                <Toolbar.Link
                                    href={`${props.signInPath}?next=${encodeURIComponent(pathname)}`}
                                    className="kcms-button kcms-primary"
                                    style={{ textDecoration: 'none' }}>
                                    Sign in to edit
                                </Toolbar.Link>
                            ) : null}
                            <Toolbar.Separator className="kcms-divider" />
                            <Hint label="Exit preview">
                                <Toolbar.Link href={exitHref} className="kcms-tool" aria-label="Exit preview">
                                    <X {...iconSize} />
                                </Toolbar.Link>
                            </Hint>
                        </Toolbar.Root>
                    ) : (
                        <Toolbar.Root className="kcms-toolbar" aria-label="Preview">
                            <Menu.Root>
                                <Toolbar.Button render={<Menu.Trigger />} className="kcms-switcher" aria-label="Switch page">
                                    <span className="kcms-switcher-title">{pageTitle}</span>
                                    <span className="kcms-switcher-path">{description?.path ?? pathname}</span>
                                    <ChevronDown {...smallIcon} style={{ flex: 'none', color: palette.muted }} />
                                </Toolbar.Button>
                                <Menu.Portal container={root}>
                                    <Menu.Positioner side="top" align="start" sideOffset={10} style={{ zIndex: LAYER + 2 }}>
                                        <Menu.Popup className="kcms-popup kcms-menu" style={{ minWidth: '220px' }}>
                                            <Menu.Group>
                                                <Menu.GroupLabel className="kcms-menu-label">Pages</Menu.GroupLabel>
                                                {pages.map((page) => (
                                                    <Menu.Item
                                                        key={page.ref}
                                                        className="kcms-menu-item"
                                                        label={page.path}
                                                        onClick={() => {
                                                            if (page.path !== pathname) router.push(page.path);
                                                        }}>
                                                        <span className="kcms-menu-check">
                                                            {page.path === (description?.path ?? pathname) ? (
                                                                <Check {...smallIcon} />
                                                            ) : null}
                                                        </span>
                                                        {page.path}
                                                    </Menu.Item>
                                                ))}
                                            </Menu.Group>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                            <Toolbar.Separator className="kcms-divider" />
                            <ToggleGroup
                                className="kcms-segmented"
                                value={[mode]}
                                onValueChange={(next) => {
                                    const chosen = next[0];
                                    if (chosen === 'edit' || chosen === 'interact') setMode(chosen);
                                    if (chosen === 'interact') setEditing(undefined);
                                }}>
                                <Hint label="Click text or images to edit them" shortcut="V">
                                    <Toolbar.Button render={<Toggle value="edit" />} className="kcms-segment">
                                        <PenLine {...smallIcon} />
                                        Edit
                                    </Toolbar.Button>
                                </Hint>
                                <Hint label="Use the page as a visitor would" shortcut="I">
                                    <Toolbar.Button render={<Toggle value="interact" />} className="kcms-segment">
                                        <Eye {...smallIcon} />
                                        Browse
                                    </Toolbar.Button>
                                </Hint>
                            </ToggleGroup>
                            {description !== undefined ? (
                                <Toolbar.Button
                                    render={<Toggle pressed={panelOpen} onPressedChange={setPanelOpen} />}
                                    className="kcms-button kcms-ghost kcms-toggle">
                                    <PanelRight {...smallIcon} />
                                    Fields
                                </Toolbar.Button>
                            ) : null}
                            {description !== undefined || onPage.length > 0 ? (
                                <>
                                    <Toolbar.Separator className="kcms-divider" />
                                    <span className="kcms-status" role="status">
                                        {saveState === 'saving' || saveState === 'pending' || saveState === 'failed' ? (
                                            <SaveStatus state={saveState} />
                                        ) : pending.length > 0 ? (
                                            <>
                                                <span className="kcms-dot" data-status="changed" />
                                                {pending.length === 1 ? '1 unpublished change' : `${pending.length} unpublished changes`}
                                            </>
                                        ) : description !== undefined ? (
                                            <>
                                                <span className="kcms-dot" data-status={description.status} />
                                                {STATUS_LABELS[description.status]}
                                            </>
                                        ) : (
                                            <>
                                                <span className="kcms-dot" data-status="published" />
                                                Published
                                            </>
                                        )}
                                    </span>
                                    <Toolbar.Button
                                        className="kcms-button kcms-primary"
                                        disabled={pending.length === 0}
                                        onClick={() => setConfirming(true)}>
                                        Publish
                                    </Toolbar.Button>
                                </>
                            ) : failure !== undefined ? (
                                <span className="kcms-status">{failure}</span>
                            ) : null}
                            <Toolbar.Separator className="kcms-divider" />
                            <Hint label="Exit preview">
                                <Toolbar.Link href={exitHref} className="kcms-tool" aria-label="Exit preview">
                                    <X {...iconSize} />
                                </Toolbar.Link>
                            </Hint>
                        </Toolbar.Root>
                    )}

                    {notice !== undefined ? (
                        <div style={styles.toast} role="status">
                            {notice}
                        </div>
                    ) : null}

                    <Popover.Root
                        open={editing !== undefined && editingField !== undefined}
                        onOpenChange={(open) => {
                            if (!open) setEditing(undefined);
                        }}>
                        <Popover.Portal container={root}>
                            <Popover.Positioner
                                anchor={anchor}
                                side="bottom"
                                align="start"
                                sideOffset={10}
                                collisionPadding={12}
                                positionMethod="fixed"
                                style={{ zIndex: LAYER + 1 }}>
                                <Popover.Popup
                                    className="kcms-popup"
                                    finalFocus={false}
                                    style={{
                                        width:
                                            editingField !== undefined && isRichTextJsonSchema(editingField.schema)
                                                ? 'min(560px, calc(100vw - 24px))'
                                                : 'min(300px, calc(100vw - 24px))',
                                    }}>
                                    {editingField !== undefined && editingDocument !== undefined ? (
                                        <>
                                            <div style={styles.header}>
                                                <Popover.Title style={styles.headerTitle}>
                                                    {editingField.label ?? humanize(editingField.name)}
                                                </Popover.Title>
                                                <Popover.Close className="kcms-icon" aria-label="Done">
                                                    <X {...smallIcon} />
                                                </Popover.Close>
                                            </div>
                                            {editingDocument.kind !== 'page' ? (
                                                <div className="kcms-shared">
                                                    <span className="kcms-shared-title">{documentLabel(editingDocument)}</span>
                                                    <span>
                                                        {editingDocument.usedOn.everywhere
                                                            ? 'Shared across the site. Changes show on every page that uses it.'
                                                            : otherPages.length > 0
                                                              ? `Also shown on ${otherPages.map((used) => used.path).join(', ')}.`
                                                              : 'Changes show wherever this item appears.'}
                                                    </span>
                                                </div>
                                            ) : null}
                                            <FieldForm
                                                key={`${editingDocument.ref}:${editingField.path}`}
                                                fields={[editingField]}
                                                described={editingDocument.fields}
                                                draft={editingDocument.draft}
                                                api={api}
                                                onSave={saveTo(editingDocument.ref)}
                                                onState={setSaveState}
                                                variant="popover"
                                            />
                                        </>
                                    ) : null}
                                </Popover.Popup>
                            </Popover.Positioner>
                        </Popover.Portal>
                    </Popover.Root>

                    {panelOpen && description !== undefined ? (
                        <aside style={styles.panel} aria-label="Fields">
                            <div style={styles.header}>
                                <h2 style={styles.headerTitle}>{pageTitle}</h2>
                                <SaveStatus state={saveState} />
                                <button type="button" className="kcms-icon" aria-label="Close" onClick={() => setPanelOpen(false)}>
                                    <X {...smallIcon} />
                                </button>
                            </div>
                            <FieldForm
                                key={description.ref}
                                fields={topLevel}
                                described={description.fields}
                                draft={description.draft}
                                api={api}
                                onSave={saveTo(description.ref)}
                                onState={setSaveState}
                                variant="panel"
                                intro={
                                    description.complete ? null : (
                                        <div style={{ ...styles.section, paddingTop: 0 }}>
                                            <p style={{ margin: '0 0 6px', color: palette.muted }}>
                                                Fill in {description.missing.map(humanize).join(', ')} to show this page, or ask an agent:
                                            </p>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <code style={styles.prompt}>{promptFor(description.name)}</code>
                                                <button
                                                    type="button"
                                                    className="kcms-icon"
                                                    aria-label="Copy the prompt"
                                                    onClick={() => {
                                                        void navigator.clipboard?.writeText(promptFor(description.name));
                                                        setNotice('Copied');
                                                    }}>
                                                    <Copy {...smallIcon} />
                                                </button>
                                            </div>
                                        </div>
                                    )
                                }
                            />
                        </aside>
                    ) : null}

                    <AlertDialog.Root open={confirming} onOpenChange={setConfirming}>
                        <AlertDialog.Portal container={root}>
                            <AlertDialog.Backdrop className="kcms-backdrop" />
                            <AlertDialog.Popup className="kcms-popup kcms-dialog">
                                <AlertDialog.Title style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600 }}>
                                    {pending.length === 1 ? 'Publish this change?' : `Publish ${pending.length} changes?`}
                                </AlertDialog.Title>
                                <AlertDialog.Description style={{ margin: '0 0 10px', color: palette.muted }}>
                                    Everyone sees the current drafts of:
                                </AlertDialog.Description>
                                <ul className="kcms-publish-list">
                                    {pending.map((document) => (
                                        <li key={document.ref}>
                                            {document.ref === pageRef ? pageTitle : documentLabel(document)}
                                            {document.usedOn.everywhere ? <span className="kcms-publish-note">every page</span> : null}
                                        </li>
                                    ))}
                                </ul>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                    <AlertDialog.Close className="kcms-button">
                                        Cancel <kbd className="kcms-kbd">Esc</kbd>
                                    </AlertDialog.Close>
                                    <button
                                        type="button"
                                        className="kcms-button kcms-primary"
                                        disabled={publishing}
                                        onClick={() => void publishAll()}>
                                        {publishing ? <LoaderCircle {...smallIcon} className="kcms-spin" /> : null}
                                        Publish
                                    </button>
                                </div>
                            </AlertDialog.Popup>
                        </AlertDialog.Portal>
                    </AlertDialog.Root>
                </Tooltip.Provider>
            </PortalContext.Provider>
        </div>
    );
}

interface EditorItem {
    id: string;
    ref: string;
    label: string;
    path: string | null;
    status: PageStatus;
    complete: boolean;
    updatedAt: string;
    updatedBy: string;
}

export interface ContentEditorProps {
    apiPath: string;
    basePath: string;
    /**
     * Where the draft route is served, for opening a page in the preview.
     */
    draftPath: string;
    headers?: Record<string, string>;
    globals: Array<{ name: string; label: string; group: string | null }>;
    collections: Array<{ name: string; label: string; group: string | null }>;
}

type Section =
    | {
          type: 'global';
          name: string;
      }
    | {
          type: 'collection';
          name: string;
      };

/**
 * Where a collection's items are listed and added.
 */
const itemsRoute = (section: Section): string => `/collections/${encodeURIComponent(section.name)}/items`;

const CONTENT_EDITOR_STYLES = `
.kcms-editor {
    display: grid;
    grid-template-columns: 180px 260px minmax(0, 1fr);
    min-height: 520px;
    border-radius: 12px;
    background: ${palette.surface};
    box-shadow: ${shadow};
    overflow: hidden;
}
.kcms-editor-nav {
    padding: 10px 8px;
    background: ${palette.fill};
}
.kcms-editor-heading {
    margin: 10px 8px 4px;
    color: ${palette.muted};
    font-size: 11px;
    font-weight: 500;
}
.kcms-editor-link {
    display: flex;
    align-items: center;
    width: 100%;
    height: 28px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: ${palette.text};
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.kcms-editor-link:hover {
    background: ${palette.fillHover};
}
.kcms-editor-link[aria-current='true'] {
    background: ${palette.surface};
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.kcms-editor-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
}
.kcms-editor-items {
    flex: 1;
    overflow: auto;
    padding: 0 6px 8px;
}
.kcms-editor-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: ${palette.text};
    font: inherit;
    text-align: left;
    cursor: pointer;
}
.kcms-editor-item:hover {
    background: ${palette.fill};
}
.kcms-editor-item[aria-selected='true'] {
    background: ${palette.fill};
    box-shadow: inset 2px 0 0 ${palette.blue};
}
.kcms-editor-item-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    color: ${palette.muted};
    font-size: 11px;
}
.kcms-editor-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-left: 1px solid ${palette.fill};
}
.kcms-editor-empty {
    margin: auto;
    color: ${palette.muted};
}
`;

/**
 * Collections and globals edited directly, for `/cms`: pick one, pick an item,
 * and change it in the same fields the preview uses. Every change saves to the
 * draft as you type; Publish makes it live.
 */
export function ContentEditor(props: ContentEditorProps) {
    const api = useApi(props);
    const [root, setRoot] = useState<HTMLDivElement | null>(null);
    const first: Section | undefined =
        props.collections[0] !== undefined
            ? {
                  type: 'collection',
                  name: props.collections[0].name,
              }
            : props.globals[0] !== undefined
              ? {
                    type: 'global',
                    name: props.globals[0].name,
                }
              : undefined;
    const [section, setSection] = useState<Section | undefined>(first);
    const [items, setItems] = useState<EditorItem[]>([]);
    const [selected, setSelected] = useState<string | undefined>();
    const [document, setDocument] = useState<Description | undefined>();
    const [saveState, setSaveState] = useState<SaveState>('idle');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [notice, setNotice] = useState<string | undefined>();
    const etag = useRef<string | null>(null);

    const loadItems = useCallback(
        async (listed: Section) => {
            const result = await api.call('GET', itemsRoute(listed));
            if (result.status === 200) setItems((result.body as { items: EditorItem[] }).items);
        },
        [api]
    );

    const select = useCallback(
        async (ref: string | undefined) => {
            setSelected(ref);
            setDocument(undefined);
            if (ref === undefined) return;
            const result = await api.call('GET', `/describe?ref=${encodeURIComponent(ref)}`);
            if (result.status === 200) {
                etag.current = result.etag;
                setDocument(result.body as Description);
            }
        },
        [api]
    );

    useEffect(() => {
        if (section === undefined) return;
        if (section.type === 'global') {
            setItems([]);
            void select(`global:${section.name}`);
            return;
        }
        void select(undefined);
        void loadItems(section);
    }, [section, loadItems, select]);

    useEffect(() => {
        if (notice === undefined) return;
        const timer = window.setTimeout(() => setNotice(undefined), 2400);
        return () => window.clearTimeout(timer);
    }, [notice]);

    const save = useCallback(
        async (changes: Record<string, unknown>): Promise<SaveFailure | undefined> => {
            if (selected === undefined) return { problem: 'Nothing is selected' };
            const result = await api.call(
                'PATCH',
                `${routeOf(selected)}/draft`,
                {
                    changes,
                    autosave: true,
                },
                etag.current === null
                    ? {}
                    : {
                          'if-match': etag.current,
                      }
            );
            if (result.status === 200) {
                etag.current = result.etag;
                const body = result.body as DraftBody;
                setDocument((previous) =>
                    previous === undefined
                        ? previous
                        : {
                              ...previous,
                              draft: body.content,
                              status: body.status,
                              version: body.version,
                              complete: body.complete,
                              missing: body.missing,
                              fields: previous.fields.map((field) => ({
                                  ...field,
                                  value: valueAt(body.content, field.path),
                              })),
                          }
                );
                if (section !== undefined && section.type !== 'global') void loadItems(section);
                return undefined;
            }
            const problem = result.body as Problem;
            if (result.status === 409 && problem.detail?.startsWith('Another ') === true) return { problem: problem.detail };
            if (result.status === 409) return { problem: 'Someone else changed this. Reload to get their version.' };
            if (result.status === 422 && problem.errors !== undefined && problem.errors.length > 0) {
                return {
                    fieldErrors: Object.fromEntries(problem.errors.map((error) => [error.path.join('.'), error.message])),
                };
            }
            return { problem: problem.detail ?? `The CMS answered ${result.status}` };
        },
        [api, loadItems, section, selected]
    );

    const create = async (): Promise<void> => {
        if (section === undefined || section.type === 'global') return;
        const result = await api.call('POST', itemsRoute(section), {});
        if (result.status !== 201) {
            setNotice((result.body as Problem).detail ?? `The CMS answered ${result.status}`);
            return;
        }
        await loadItems(section);
        await select((result.body as { ref: string }).ref);
    };

    /**
     * Opens the page in the preview, through a token the API mints.
     */
    const open = async (path: string): Promise<void> => {
        const result = await api.call('POST', '/preview', {});
        if (result.status !== 201) {
            setNotice((result.body as Problem).detail ?? `The CMS answered ${result.status}`);
            return;
        }
        const token = (result.body as { token: string }).token;
        window.open(`${props.draftPath}?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(path)}`, '_blank', 'noopener');
    };

    const publish = async (): Promise<void> => {
        if (selected === undefined) return;
        const result = await api.call('POST', `${routeOf(selected)}/publish`, {});
        if (result.status !== 200) {
            setNotice((result.body as Problem).detail ?? `Publishing failed with ${result.status}`);
            return;
        }
        setNotice('Published');
        await select(selected);
        if (section !== undefined && section.type !== 'global') await loadItems(section);
    };

    const remove = async (): Promise<void> => {
        if (selected === undefined || section === undefined || section.type === 'global') return;
        setConfirmDelete(false);
        const result = await api.call('DELETE', routeOf(selected));
        if (result.status !== 204) {
            setNotice((result.body as Problem).detail ?? `Deleting failed with ${result.status}`);
            return;
        }
        setNotice('Deleted');
        await select(undefined);
        await loadItems(section);
    };

    const sectionLabel =
        section === undefined
            ? ''
            : ([...props.collections, ...props.globals].find((candidate) => candidate.name === section.name)?.label ??
              humanize(section.name));
    const topLevel = document?.fields.filter((field) => field.parent === undefined) ?? [];

    return (
        <div ref={setRoot} data-kizuna-cms-overlay="">
            <style>{STYLESHEET + CONTENT_EDITOR_STYLES}</style>
            <PortalContext.Provider value={root}>
                <Tooltip.Provider delay={500}>
                    <div className="kcms-editor">
                        <nav className="kcms-editor-nav" aria-label="Content">
                            {props.collections.length > 0 ? <p className="kcms-editor-heading">Collections</p> : null}
                            {props.collections.map((candidate) => (
                                <button
                                    key={candidate.name}
                                    type="button"
                                    className="kcms-editor-link"
                                    aria-current={section?.type === 'collection' && section.name === candidate.name}
                                    onClick={() =>
                                        setSection({
                                            type: 'collection',
                                            name: candidate.name,
                                        })
                                    }>
                                    {candidate.label}
                                </button>
                            ))}
                            {props.globals.length > 0 ? <p className="kcms-editor-heading">Site-wide</p> : null}
                            {props.globals.map((candidate) => (
                                <button
                                    key={candidate.name}
                                    type="button"
                                    className="kcms-editor-link"
                                    aria-current={section?.type === 'global' && section.name === candidate.name}
                                    onClick={() =>
                                        setSection({
                                            type: 'global',
                                            name: candidate.name,
                                        })
                                    }>
                                    {candidate.label}
                                </button>
                            ))}
                        </nav>
                        {section !== undefined && section.type !== 'global' ? (
                            <div className="kcms-editor-list">
                                <div style={styles.header}>
                                    <h2 style={styles.headerTitle}>{sectionLabel}</h2>
                                    <button type="button" className="kcms-button" onClick={() => void create()}>
                                        <Plus {...smallIcon} />
                                        New
                                    </button>
                                </div>
                                <div className="kcms-editor-items" role="listbox" aria-label={sectionLabel}>
                                    {items.length === 0 ? <p style={{ ...styles.help, margin: '8px' }}>Nothing here yet.</p> : null}
                                    {items.map((item) => (
                                        <button
                                            key={item.ref}
                                            type="button"
                                            role="option"
                                            className="kcms-editor-item"
                                            aria-selected={item.ref === selected}
                                            onClick={() => void select(item.ref)}>
                                            <span style={{ fontWeight: 500 }}>{item.label}</span>
                                            {item.path !== null ? <span className="kcms-editor-item-meta">{item.path}</span> : null}
                                            <span className="kcms-editor-item-meta">
                                                <span className="kcms-dot" data-status={item.status} />
                                                {item.complete ? STATUS_LABELS[item.status] : 'Incomplete'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="kcms-editor-list" />
                        )}
                        <section className="kcms-editor-pane" aria-label="Fields">
                            {document === undefined ? (
                                <p className="kcms-editor-empty">
                                    {section !== undefined && section.type !== 'global' ? 'Pick an item, or add one.' : ''}
                                </p>
                            ) : (
                                <>
                                    <div style={styles.header}>
                                        <h2 style={styles.headerTitle}>{documentLabel(document)}</h2>
                                        <SaveStatus state={saveState} />
                                        <span className="kcms-status">
                                            <span className="kcms-dot" data-status={document.status} />
                                            {STATUS_LABELS[document.status]}
                                        </span>
                                        {document.path !== null ? (
                                            <button
                                                type="button"
                                                className="kcms-button kcms-ghost"
                                                onClick={() => void open(document.path!)}>
                                                Open
                                            </button>
                                        ) : null}
                                        {document.kind === 'item' ? (
                                            <button type="button" className="kcms-button kcms-ghost" onClick={() => setConfirmDelete(true)}>
                                                Delete
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            className="kcms-button kcms-primary"
                                            disabled={!isPending(document)}
                                            onClick={() => void publish()}>
                                            Publish
                                        </button>
                                    </div>
                                    {document.usedOn.everywhere || document.usedOn.pages.length > 0 ? (
                                        <div className="kcms-shared" style={{ margin: '0 14px 4px' }}>
                                            <span>
                                                {document.usedOn.everywhere
                                                    ? 'Shared across the site.'
                                                    : `Shown on ${document.usedOn.pages.map((used) => used.path).join(', ')}.`}
                                            </span>
                                        </div>
                                    ) : null}
                                    <FieldForm
                                        key={document.ref}
                                        fields={topLevel}
                                        described={document.fields}
                                        draft={document.draft}
                                        api={api}
                                        onSave={save}
                                        onState={setSaveState}
                                        variant="panel"
                                    />
                                </>
                            )}
                        </section>
                    </div>
                    {notice !== undefined ? (
                        <div style={styles.toast} role="status">
                            {notice}
                        </div>
                    ) : null}
                    <AlertDialog.Root open={confirmDelete} onOpenChange={setConfirmDelete}>
                        <AlertDialog.Portal container={root}>
                            <AlertDialog.Backdrop className="kcms-backdrop" />
                            <AlertDialog.Popup className="kcms-popup kcms-dialog">
                                <AlertDialog.Title style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 600 }}>
                                    Delete {document === undefined ? 'this item' : documentLabel(document)}?
                                </AlertDialog.Title>
                                <AlertDialog.Description style={{ margin: '0 0 16px', color: palette.muted }}>
                                    {document !== undefined && document.usedOn.pages.length > 0
                                        ? `It disappears from ${document.usedOn.pages.map((used) => used.path).join(', ')}, and its history goes with it.`
                                        : 'Its history goes with it.'}
                                </AlertDialog.Description>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                                    <AlertDialog.Close className="kcms-button">
                                        Cancel <kbd className="kcms-kbd">Esc</kbd>
                                    </AlertDialog.Close>
                                    <button type="button" className="kcms-button kcms-primary" onClick={() => void remove()}>
                                        Delete
                                    </button>
                                </div>
                            </AlertDialog.Popup>
                        </AlertDialog.Portal>
                    </AlertDialog.Root>
                </Tooltip.Provider>
            </PortalContext.Provider>
        </div>
    );
}
