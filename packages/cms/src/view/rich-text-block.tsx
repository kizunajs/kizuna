import { useEffect, useId, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { useEditor, type BlockObjectRenderProps } from '@portabletext/editor';
import { ArrowDown, ArrowUp, ChevronDown, Ellipsis, Trash2, type LucideIcon } from 'lucide-react';
import { ICON, useEditorContext } from './context.js';
import { BlockFields } from './controls.js';
import type { MediaRecord } from './media.js';
import { useItemSearch } from './reference-sheet.js';
import { rowLabelsOf, tagPropertyOf } from './array-rows.js';
import { humanize, isImage, isLink, resolveRef, typeOf, type DescribedBlock, type JsonSchema } from './schema.js';

/**
 * One block rich text may hold, with what the editor shows of it.
 */
export interface RichTextBlockChoice {
    name: string;
    label: string;
    icon: LucideIcon;
    schema: JsonSchema;
    described: DescribedBlock | undefined;
}

/**
 * What a folded block shows of itself after its label: a choice it holds,
 * its first words, the photos and the items it picks.
 */
interface BlockSummary {
    tag: string | undefined;
    text: string | undefined;
    more: number;
    images: string[];
    reference:
        | {
              brand: string;
              ids: string[];
          }
        | undefined;
}

const MOST_THUMBS = 2;

const summaryOf = (choice: RichTextBlockChoice, root: JsonSchema, values: Record<string, unknown>): BlockSummary => {
    const summary: BlockSummary = {
        tag: undefined,
        text: rowLabelsOf(choice.schema, root, values).title,
        more: 0,
        images: [],
        reference: undefined,
    };
    const tagProperty = tagPropertyOf(choice.schema, root);
    const tag = tagProperty === undefined ? undefined : values[tagProperty];
    if (typeof tag === 'string' && tag !== '') {
        summary.tag = choice.described?.fields.find((field) => field.name === tagProperty)?.options?.[tag] ?? humanize(tag);
    }
    for (const [name, property] of Object.entries(choice.schema.properties ?? {})) {
        const value = values[name];
        if (value === undefined || value === null) continue;
        const resolved = resolveRef(property, root);
        if (isImage(property, root)) {
            const id = (value as { id?: unknown }).id;
            if (typeof id === 'string') summary.images.push(id);
            continue;
        }
        if (isLink(resolved)) {
            const link = value as { label?: unknown; href?: unknown };
            const words = typeof link.label === 'string' && link.label !== '' ? link.label : link.href;
            if (summary.text === undefined && typeof words === 'string') summary.text = words;
            continue;
        }
        if (resolved.brand !== undefined && typeof value === 'string' && value !== '') {
            summary.reference ??= {
                brand: resolved.brand,
                ids: [value],
            };
            continue;
        }
        if (typeOf(resolved) !== 'array' || !Array.isArray(value) || value.length === 0) continue;
        const item = resolveRef(resolved.items ?? {}, root);
        if (item.brand !== undefined) {
            summary.reference ??= {
                brand: item.brand,
                ids: value.filter((id): id is string => typeof id === 'string'),
            };
        } else if (typeOf(item) === 'object' && summary.text === undefined) {
            summary.text = rowLabelsOf(item, root, value[0]).title;
            summary.more = value.length - 1;
        }
    }
    return summary;
};

/**
 * The photos a folded block holds, as small thumbnails.
 */
function MediaThumbs({ ids }: { ids: readonly string[] }) {
    const { connection, resolveUrl } = useEditorContext();
    const [sources, setSources] = useState<string[]>([]);
    const key = ids.slice(0, MOST_THUMBS).join(' ');
    useEffect(() => {
        if (key === '') {
            setSources([]);
            return;
        }
        let current = true;
        void Promise.all(
            key.split(' ').map((id) =>
                connection.call<MediaRecord>('editing_media_get', {
                    params: {
                        id,
                    },
                })
            )
        ).then((answers) => {
            if (!current) return;
            setSources(
                answers.flatMap((answer) => {
                    const source = answer.status === 200 ? resolveUrl(`${answer.body.url}?w=96`) : undefined;
                    return source === undefined ? [] : [source];
                })
            );
        });
        return () => {
            current = false;
        };
    }, [connection, resolveUrl, key]);
    return sources.map((source) => <img key={source} className="k-thumb" src={source} alt="" />);
}

/**
 * The items a folded block picks: the first one's thumbnail and name, and
 * how many more.
 */
function ReferenceSummary({ brand, ids, showsName }: { brand: string; ids: readonly string[]; showsName: boolean }) {
    const { resolveUrl } = useEditorContext();
    const search = useItemSearch(brand);
    const [found, setFound] = useState<{ label: string; image: string | undefined } | undefined>();
    const first = ids[0];
    useEffect(() => {
        if (first === undefined) return;
        let current = true;
        void search({
            ids: [first],
        }).then((items) => {
            if (!current) return;
            const item = items[0];
            setFound(
                item === undefined
                    ? undefined
                    : {
                          label: item.label,
                          image: item.image,
                      }
            );
        });
        return () => {
            current = false;
        };
    }, [search, first]);
    if (found === undefined) return null;
    return (
        <>
            {found.image === undefined ? null : <img className="k-thumb" src={resolveUrl(found.image)} alt="" />}
            <span className={showsName ? 'k-rich__block-text' : 'k-rich__block-by'}>{found.label}</span>
            {ids.length > 1 ? <span className="k-rich__block-more">+{ids.length - 1}</span> : null}
        </>
    );
}

/**
 * The line a folded block shows after its label, so the text reads without
 * opening it.
 */
function BlockSummaryLine({ summary }: { summary: BlockSummary }) {
    return (
        <span className="k-rich__block-summary">
            {summary.tag === undefined ? null : <span className="k-rich__block-tag">{summary.tag}</span>}
            <MediaThumbs ids={summary.images} />
            {summary.text === undefined ? null : <span className="k-rich__block-text">{summary.text}</span>}
            {summary.more > 0 ? <span className="k-rich__block-more">+{summary.more}</span> : null}
            {summary.reference === undefined ? null : (
                <ReferenceSummary brand={summary.reference.brand} ids={summary.reference.ids} showsName={summary.text === undefined} />
            )}
        </span>
    );
}

/**
 * A block in the text: its icon and label, and folded, a line of what it
 * holds. Open, its fields show under them, each writing the node as a whole.
 * Its menu moves it up or down, or removes it. A block starts open while it
 * holds nothing, as one just inserted does.
 */
export function RichTextBlock({ props, choice, root }: { props: BlockObjectRenderProps; choice: RichTextBlockChoice; root: JsonSchema }) {
    const editor = useEditor();
    const panel = useId();
    const at = [
        {
            _key: props.node._key,
        },
    ];
    const { _type: _name, _key: _ownKey, ...values } = props.node as Record<string, unknown>;
    const [open, setOpen] = useState(() => Object.keys(values).length === 0);
    const change = (next: unknown): void => {
        const updated = (next ?? {}) as Record<string, unknown>;
        const removed = Object.keys(values).filter((name) => !(name in updated));
        if (removed.length > 0) {
            editor.send({
                type: 'block.unset',
                at,
                props: removed,
            });
        }
        editor.send({
            type: 'block.set',
            at,
            props: updated,
        });
    };
    const Icon = choice.icon;
    return (
        <div {...props.attributes} className="k-rich__block" data-selected={props.selected}>
            {props.children}
            <div
                contentEditable={false}
                className="k-rich__block-card"
                data-open={open}
                onKeyDown={(event) => event.stopPropagation()}
                onPaste={(event) => event.stopPropagation()}>
                <div className="k-rich__block-head">
                    <button
                        type="button"
                        className="k-rich__block-toggle"
                        aria-expanded={open}
                        aria-controls={panel}
                        onClick={() => setOpen(!open)}>
                        <Icon {...ICON} className="k-rich__block-icon" />
                        <span className="k-rich__block-name">{choice.label}</span>
                        {open ? null : <BlockSummaryLine summary={summaryOf(choice, root, values)} />}
                        <ChevronDown {...ICON} className="k-rich__block-chevron" />
                    </button>
                    {props.readOnly ? null : (
                        <Menu.Root>
                            <Menu.Trigger className="k-icon-button" aria-label={`More for ${choice.label}`}>
                                <Ellipsis {...ICON} />
                            </Menu.Trigger>
                            <Menu.Portal>
                                <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                                    <Menu.Popup className="k-popup k-menu">
                                        <Menu.Item
                                            className="k-menu__item"
                                            onClick={() =>
                                                editor.send({
                                                    type: 'move.block up',
                                                    at,
                                                })
                                            }>
                                            <ArrowUp {...ICON} />
                                            Move up
                                        </Menu.Item>
                                        <Menu.Item
                                            className="k-menu__item"
                                            onClick={() =>
                                                editor.send({
                                                    type: 'move.block down',
                                                    at,
                                                })
                                            }>
                                            <ArrowDown {...ICON} />
                                            Move down
                                        </Menu.Item>
                                        <Menu.Item
                                            className="k-menu__item"
                                            onClick={() =>
                                                editor.send({
                                                    type: 'delete.block',
                                                    at,
                                                })
                                            }>
                                            <Trash2 {...ICON} />
                                            Remove
                                        </Menu.Item>
                                    </Menu.Popup>
                                </Menu.Positioner>
                            </Menu.Portal>
                        </Menu.Root>
                    )}
                </div>
                {open ? (
                    <div id={panel} className="k-rich__block-fields">
                        <BlockFields
                            schema={choice.schema}
                            root={root}
                            value={values}
                            onChange={change}
                            disabled={props.readOnly}
                            described={choice.described}
                        />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
