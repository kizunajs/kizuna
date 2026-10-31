import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Menu } from '@base-ui/react/menu';
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
    type FieldDefinition,
    type PortableTextBlock,
} from '@portabletext/editor';
import { EventListenerPlugin, NodePlugin } from '@portabletext/editor/plugins';
import { isActiveAnnotation, isActiveDecorator, isActiveListItem, isActiveStyle } from '@portabletext/editor/selectors';
import {
    ArrowDown,
    ArrowUp,
    Blocks,
    Bold,
    Code,
    Ellipsis,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    ListOrdered,
    Pilcrow,
    Quote,
    Trash2,
    Underline,
    Unlink,
} from 'lucide-react';
import { ICON, useEditorContext } from './context.js';
import { BlockFields, BlockPicker, type ControlProps } from './controls.js';
import { Hint } from './hint.js';
import { MediaPicker, type MediaRecord } from './media.js';
import { humanize, richTextBlockOptionsOf, SAFE_HREF, typeOf, type DescribedBlock, type JsonSchema } from './schema.js';

/**
 * One block rich text may hold, with what the editor shows of it.
 */
interface RichTextBlockChoice {
    name: string;
    label: string;
    schema: JsonSchema;
    described: DescribedBlock | undefined;
}

/**
 * The kind of value the editor keeps under a block's field.
 */
const fieldTypeOf = (schema: JsonSchema): FieldDefinition['type'] => {
    const type = typeOf(schema);
    if (type === 'integer') return 'number';
    return type === 'string' || type === 'number' || type === 'boolean' || type === 'array' ? type : 'object';
};

/**
 * The same marks, styles and blocks the field's schema stores, with each block
 * it may hold beside images.
 */
const richTextSchemaOf = (choices: readonly RichTextBlockChoice[]) =>
    defineSchema({
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
            ...choices.map((choice) => ({
                name: choice.name,
                title: choice.label,
                fields: Object.entries(choice.schema.properties ?? {}).map(([name, property]) => ({
                    name,
                    type: fieldTypeOf(property),
                })),
            })),
        ],
        inlineObjects: [],
    });

function RichTextImage(props: BlockObjectRenderProps) {
    const { connection, resolveUrl } = useEditorContext();
    const editor = useEditor();
    const image = (props.node as { image?: { id?: string; alt?: string } }).image ?? {};
    const [source, setSource] = useState<string | undefined>();
    useEffect(() => {
        if (image.id === undefined) return;
        void connection
            .call<MediaRecord>('editing_media_get', {
                params: {
                    id: image.id,
                },
            })
            .then((answer) => {
                if (answer.status === 200) setSource(resolveUrl(answer.body.url));
            });
    }, [connection, resolveUrl, image.id]);
    return (
        <div {...props.attributes} className="k-rich__image" data-selected={props.selected}>
            {props.children}
            <div contentEditable={false}>
                {source !== undefined ? <img src={source} alt="" /> : null}
                <input
                    className="k-input"
                    placeholder="What the image shows"
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

/**
 * A block in the text: its name, a menu to move or remove it, and its fields
 * below, each writing the node as a whole.
 */
function RichTextBlock({ props, choice, root }: { props: BlockObjectRenderProps; choice: RichTextBlockChoice; root: JsonSchema }) {
    const editor = useEditor();
    const at = [
        {
            _key: props.node._key,
        },
    ];
    const { _type: _name, _key: _ownKey, ...values } = props.node as Record<string, unknown>;
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
    return (
        <div {...props.attributes} className="k-rich__block" data-selected={props.selected}>
            {props.children}
            <div
                contentEditable={false}
                className="k-rich__block-card"
                onKeyDown={(event) => event.stopPropagation()}
                onPaste={(event) => event.stopPropagation()}>
                <div className="k-rich__block-head">
                    <span className="k-rich__block-name">{choice.label}</span>
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
                <BlockFields
                    schema={choice.schema}
                    root={root}
                    value={values}
                    onChange={change}
                    disabled={props.readOnly}
                    described={choice.described}
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
        render: ({ children }) => <span className="k-rich__link">{children}</span>,
    }),
    defineBlockObject({
        type: 'image',
        render: (props) => <RichTextImage {...props} />,
    }),
];

/**
 * How the editor draws each node, with a node for every block the field may
 * hold.
 */
const richTextNodesOf = (choices: readonly RichTextBlockChoice[], root: JsonSchema) => [
    ...RICH_TEXT_NODES,
    ...choices.map((choice) =>
        defineBlockObject({
            type: choice.name,
            render: (props) => <RichTextBlock props={props} choice={choice} root={root} />,
        })
    ),
];

/**
 * The toolbar's insert for blocks: the block itself when the field holds one,
 * or a picker of every block it may hold.
 */
function InsertBlock({ choices }: { choices: readonly RichTextBlockChoice[] }) {
    const editor = useEditor();
    const [picking, setPicking] = useState(false);
    const insert = (name: string): void => {
        setPicking(false);
        editor.send({
            type: 'insert.block object',
            placement: 'auto',
            blockObject: {
                name,
                value: {},
            },
        });
        editor.send({
            type: 'focus',
        });
    };
    const only = choices.length === 1 ? choices[0] : undefined;
    return (
        <>
            <button
                type="button"
                className="k-button k-button--secondary k-button--small"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => (only === undefined ? setPicking(true) : insert(only.name))}>
                <Blocks {...ICON} />
                {only?.label ?? 'Block'}
            </button>
            {only === undefined ? (
                <BlockPicker open={picking} onOpenChange={setPicking} noun="block" label={undefined} choices={choices} onPick={insert} />
            ) : null}
        </>
    );
}

function ToolbarButton(props: { label: string; active: boolean; onPress: () => void; children: ReactNode }) {
    return (
        <Hint label={props.label}>
            <button
                type="button"
                className="k-rich__tool"
                aria-label={props.label}
                aria-pressed={props.active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={props.onPress}>
                {props.children}
            </button>
        </Hint>
    );
}

function Toolbar({ choices }: { choices: readonly RichTextBlockChoice[] }) {
    const editor = useEditor();
    const focus = (): void =>
        editor.send({
            type: 'focus',
        });
    const style = (name: string) => () => {
        editor.send({
            type: 'style.toggle',
            style: name,
        });
        focus();
    };
    const decorator = (name: string) => () => {
        editor.send({
            type: 'decorator.toggle',
            decorator: name,
        });
        focus();
    };
    const list = (name: string) => () => {
        editor.send({
            type: 'list item.toggle',
            listItem: name,
        });
        focus();
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

    const addLink = (): void => {
        if (!SAFE_HREF.test(href)) {
            setProblem('A link goes to https://, http://, mailto:, tel:, a path like /blog, or an #anchor.');
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
        focus();
        setLinking(false);
        setHref('');
        setProblem(undefined);
    };

    return (
        <div className="k-rich__toolbar">
            <div className="k-rich__tools">
                <ToolbarButton label="Paragraph" active={!h2 && !h3 && !quote} onPress={style('normal')}>
                    <Pilcrow {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Heading" active={h2} onPress={style('h2')}>
                    <Heading2 {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Subheading" active={h3} onPress={style('h3')}>
                    <Heading3 {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Quote" active={quote} onPress={style('blockquote')}>
                    <Quote {...ICON} />
                </ToolbarButton>
                <span className="k-rich__divider" />
                <ToolbarButton label="Bold" active={strong} onPress={decorator('strong')}>
                    <Bold {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Italic" active={em} onPress={decorator('em')}>
                    <Italic {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Underline" active={underline} onPress={decorator('underline')}>
                    <Underline {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Code" active={code} onPress={decorator('code')}>
                    <Code {...ICON} />
                </ToolbarButton>
                <span className="k-rich__divider" />
                <ToolbarButton label="Bulleted list" active={bullet} onPress={list('bullet')}>
                    <List {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Numbered list" active={number} onPress={list('number')}>
                    <ListOrdered {...ICON} />
                </ToolbarButton>
                <span className="k-rich__divider" />
                {linked ? (
                    <ToolbarButton
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
                        <Unlink {...ICON} />
                    </ToolbarButton>
                ) : (
                    <ToolbarButton label="Link" active={linking} onPress={() => setLinking(!linking)}>
                        <Link {...ICON} />
                    </ToolbarButton>
                )}
                <MediaPicker
                    current={undefined}
                    disabled={false}
                    label="Image"
                    onPick={(record) =>
                        editor.send({
                            type: 'insert.block object',
                            placement: 'auto',
                            blockObject: {
                                name: 'image',
                                value: {
                                    image: {
                                        id: record.id,
                                        alt: record.alt ?? '',
                                    },
                                },
                            },
                        })
                    }
                />
                {choices.length === 0 ? null : <InsertBlock choices={choices} />}
            </div>
            {linking ? (
                <input
                    className="k-input"
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
                <p className="k-error" role="alert">
                    {problem}
                </p>
            ) : null}
        </div>
    );
}

/**
 * Rich text, edited as the Portable Text it is stored as, with any blocks
 * its schema names between the paragraphs.
 */
export function RichTextControl({ schema, root, value, onChange, disabled, blocks }: ControlProps) {
    const choices = useMemo(
        () =>
            richTextBlockOptionsOf(schema, root).map((option) => {
                const described = blocks?.find((block) => block.name === option.name);
                return {
                    ...option,
                    described,
                    label: described?.label ?? humanize(option.name),
                };
            }),
        [schema, root, blocks]
    );
    const [schemaDefinition] = useState(() => richTextSchemaOf(choices));
    const nodes = useMemo(() => richTextNodesOf(choices, root), [choices, root]);
    return (
        <EditorProvider
            initialConfig={{
                schemaDefinition,
                initialValue: Array.isArray(value) ? (value as PortableTextBlock[]) : undefined,
                readOnly: disabled,
            }}>
            <EventListenerPlugin
                on={(event) => {
                    if (event.type === 'mutation') onChange(event.value);
                }}
            />
            <NodePlugin nodes={nodes} />
            <div className="k-rich">
                {disabled ? null : <Toolbar choices={choices} />}
                <PortableTextEditable className="k-rich__editable" />
            </div>
        </EditorProvider>
    );
}
