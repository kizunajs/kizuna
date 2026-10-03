import { useEffect, useState, type ReactNode } from 'react';
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
import { Bold, Code, Heading2, Heading3, Italic, Link, List, ListOrdered, Pilcrow, Quote, Underline, Unlink } from 'lucide-react';
import { ICON, useEditorContext } from './context.js';
import type { ControlProps } from './controls.js';
import { MediaPicker, type MediaRecord } from './media.js';
import { SAFE_HREF } from './schema.js';

/**
 * The same marks, styles and blocks `RichTextSchema` stores.
 */
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
        <div {...props.attributes} className="k-rich-image" data-selected={props.selected}>
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
        render: ({ children }) => <span className="k-rich-link">{children}</span>,
    }),
    defineBlockObject({
        type: 'image',
        render: (props) => <RichTextImage {...props} />,
    }),
];

function ToolbarButton(props: { label: string; active: boolean; onPress: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            className="k-tool"
            title={props.label}
            aria-label={props.label}
            aria-pressed={props.active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onPress}>
            {props.children}
        </button>
    );
}

function Toolbar() {
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
        <div className="k-rich-toolbar">
            <div className="k-rich-tools">
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
                <span className="k-rich-divider" />
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
                <span className="k-rich-divider" />
                <ToolbarButton label="Bulleted list" active={bullet} onPress={list('bullet')}>
                    <List {...ICON} />
                </ToolbarButton>
                <ToolbarButton label="Numbered list" active={number} onPress={list('number')}>
                    <ListOrdered {...ICON} />
                </ToolbarButton>
                <span className="k-rich-divider" />
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
 * Rich text, edited as the Portable Text it is stored as.
 */
export function RichTextControl({ value, onChange, disabled }: ControlProps) {
    return (
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
            <div className="k-rich">
                {disabled ? null : <Toolbar />}
                <PortableTextEditable className="k-rich-editable" />
            </div>
        </EditorProvider>
    );
}
