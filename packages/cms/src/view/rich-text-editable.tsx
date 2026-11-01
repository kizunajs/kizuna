import { useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type ComponentType, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { PortableTextEditable, useEditor, useEditorSelector, type EditorSelection } from '@portabletext/editor';
import {
    getBlockTextAfter,
    getBlockTextBefore,
    getFocusTextBlock,
    isSelectionCollapsed,
    isSelectionExpanded,
} from '@portabletext/editor/selectors';
import { blockOffsetsToSelection } from '@portabletext/editor/utils';
import { Blocks, Heading2, Heading3, ImageIcon, Link, List, ListOrdered, Pilcrow, Quote, type LucideProps } from 'lucide-react';
import { ICON, useEditorContext } from './context.js';
import { MediaPicker } from './media.js';
import { LinkTargetSheet, type LinkTarget } from './link-picker.js';
import { pastedUrlOf } from './paste-link.js';
import { filterSlashItems, groupSlashItems, slashItemsOf, slashQueryOf, stepSlashIndex, type SlashItem } from './slash-menu.js';

/**
 * A block the slash menu offers, by its label and, when it has one, its icon.
 */
interface SlashBlock {
    name: string;
    label: string;
    icon?: ComponentType<LucideProps>;
}

const ITEM_ICONS: Record<string, ComponentType<LucideProps>> = {
    normal: Pilcrow,
    h2: Heading2,
    h3: Heading3,
    blockquote: Quote,
    bullet: List,
    number: ListOrdered,
    image: ImageIcon,
    link: Link,
};

/**
 * Where the caret is on screen, for the menu and the image picker to open
 * beside it.
 */
const caretRect = (): DOMRect | undefined => {
    const selection = window.getSelection();
    if (selection === null || selection.rangeCount === 0) return undefined;
    const range = selection.getRangeAt(0);
    const rect = range.getClientRects()[0] ?? range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.left === 0 && rect.top === 0) {
        const node = range.startContainer;
        return (node instanceof Element ? node : node.parentElement)?.getBoundingClientRect();
    }
    return rect;
};

/**
 * The text of rich text, with a slash menu for what the field allows and a
 * paste that turns a URL into a link: to the page or item it shows when it is
 * on one of the sites, and otherwise to the URL over the selected words.
 */
export function RichTextEditable({ className, blocks }: { className: string; blocks: readonly SlashBlock[] }) {
    const editor = useEditor();
    const { connection } = useEditorContext();
    const menuId = useId();
    const before = useEditorSelector(editor, getBlockTextBefore);
    const after = useEditorSelector(editor, getBlockTextAfter);
    const collapsed = useEditorSelector(editor, isSelectionCollapsed);
    const blockKey = useEditorSelector(editor, (snapshot) => getFocusTextBlock(snapshot)?.node._key);
    const [focused, setFocused] = useState(false);
    const [dismissed, setDismissed] = useState<string | undefined>();
    const [active, setActive] = useState(0);
    const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number } | undefined>();
    const [imageAnchor, setImageAnchor] = useState<{ getBoundingClientRect: () => DOMRect } | undefined>();
    const [linking, setLinking] = useState(false);
    const saved = useRef<EditorSelection>(null);

    const match = focused && collapsed && blockKey !== undefined ? slashQueryOf(before, after) : undefined;
    const at = match === undefined ? undefined : `${blockKey}:${match.offset}`;
    const items = useMemo(() => slashItemsOf(blocks), [blocks]);
    const groups = useMemo(() => groupSlashItems(filterSlashItems(items, match?.query ?? '')), [items, match?.query]);
    const shown = groups.flatMap((group) => group.items.map((entry) => entry.item));
    const open = at !== undefined && at !== dismissed && shown.length > 0;

    const [query, setQuery] = useState(match?.query);
    if (match?.query !== query) {
        setQuery(match?.query);
        setActive(0);
    }
    if (at === undefined && dismissed !== undefined) setDismissed(undefined);

    useLayoutEffect(() => {
        if (!open) {
            setPosition(undefined);
            return;
        }
        const rect = caretRect();
        if (rect === undefined) return;
        const below = window.innerHeight - rect.bottom;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - 248));
        setPosition(
            below < 480 && rect.top > below
                ? {
                      left,
                      bottom: window.innerHeight - rect.top + 6,
                  }
                : {
                      left,
                      top: rect.bottom + 6,
                  }
        );
    }, [open, before]);

    useLayoutEffect(() => {
        if (open)
            document.getElementById(`${menuId}-${active}`)?.scrollIntoView({
                block: 'nearest',
            });
    }, [open, active, menuId]);

    const focus = (): void =>
        editor.send({
            type: 'focus',
        });

    const pick = (item: SlashItem): void => {
        if (match === undefined || blockKey === undefined) return;
        const typed = blockOffsetsToSelection({
            snapshot: editor.getSnapshot(),
            offsets: {
                anchor: {
                    path: [
                        {
                            _key: blockKey,
                        },
                    ],
                    offset: match.offset,
                },
                focus: {
                    path: [
                        {
                            _key: blockKey,
                        },
                    ],
                    offset: match.offset + 1 + match.query.length,
                },
            },
        });
        if (typed !== null) {
            editor.send({
                type: 'delete',
                at: typed,
            });
        }
        const action = item.action;
        if (action.kind === 'style') {
            editor.send({
                type: 'style.add',
                style: action.style,
            });
            focus();
        } else if (action.kind === 'list') {
            editor.send({
                type: 'list item.add',
                listItem: action.listItem,
            });
            focus();
        } else if (action.kind === 'block') {
            editor.send({
                type: 'insert.block object',
                placement: 'auto',
                blockObject: {
                    name: action.name,
                    value: {},
                },
            });
            focus();
        } else if (action.kind === 'image') {
            const rect = caretRect();
            if (rect !== undefined) {
                setImageAnchor({
                    getBoundingClientRect: () => rect,
                });
            }
        } else {
            saved.current = editor.getSnapshot().context.selection;
            setLinking(true);
        }
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (!open) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => stepSlashIndex(current, event.key === 'ArrowDown' ? 1 : -1, shown.length));
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            const item = shown[Math.min(active, shown.length - 1)];
            if (item !== undefined) pick(item);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setDismissed(at);
        }
    };

    const addLink = async (url: string, selection: EditorSelection, expanded: boolean): Promise<void> => {
        const answer = await connection.call<{ target: LinkTarget }>('editing_resolve_link_target', {
            query: {
                url,
            },
        });
        const target = answer.status === 200 ? answer.body.target : undefined;
        const value =
            target === undefined
                ? {
                      href: url,
                  }
                : {
                      ref: target.ref,
                  };
        if (selection !== null) {
            editor.send({
                type: 'select',
                at: selection,
            });
        }
        if (expanded) {
            editor.send({
                type: 'annotation.add',
                annotation: {
                    name: 'link',
                    value,
                },
            });
        } else if (target !== undefined) {
            editor.send({
                type: 'insert.span',
                text: target.label,
                annotations: [
                    {
                        name: 'link',
                        value,
                    },
                ],
            });
        } else {
            editor.send({
                type: 'insert.text',
                text: url,
            });
        }
        focus();
    };

    const onPasteCapture = (event: ClipboardEvent<HTMLDivElement>): void => {
        const element = event.target instanceof Element ? event.target : null;
        if (element === null || element.closest('input, textarea, [contenteditable="false"]') !== null) return;
        const url = pastedUrlOf(event.clipboardData.getData('text/plain'));
        if (url === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        const snapshot = editor.getSnapshot();
        void addLink(url, snapshot.context.selection, isSelectionExpanded(snapshot));
    };

    return (
        <>
            <PortableTextEditable
                className={className}
                onPasteCapture={onPasteCapture}
                aria-autocomplete="list"
                aria-controls={open ? menuId : undefined}
                aria-activedescendant={open ? `${menuId}-${active}` : undefined}
                onKeyDown={onKeyDown}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
            />
            {open && position !== undefined
                ? createPortal(
                      <div
                          id={menuId}
                          role="listbox"
                          aria-label="Insert"
                          className="k-popup k-menu k-slash"
                          style={position}
                          onMouseDown={(event) => event.preventDefault()}>
                          {groups.map((group) => (
                              <div key={group.group} role="group" aria-labelledby={`${menuId}-${group.group}`}>
                                  <div id={`${menuId}-${group.group}`} className="k-slash__heading" role="presentation">
                                      {group.group}
                                  </div>
                                  {group.items.map(({ item, index }) => {
                                      const Icon =
                                          ITEM_ICONS[item.key] ??
                                          blocks.find((block) => item.action.kind === 'block' && block.name === item.action.name)?.icon ??
                                          Blocks;
                                      return (
                                          <div
                                              key={item.key}
                                              id={`${menuId}-${index}`}
                                              role="option"
                                              aria-selected={index === active}
                                              className="k-menu__item k-slash__item"
                                              data-highlighted={index === active ? '' : undefined}
                                              onMouseEnter={() => setActive(index)}
                                              onClick={() => pick(item)}>
                                              <Icon {...ICON} aria-hidden="true" />
                                              <span className="k-ellipsis">{item.label}</span>
                                          </div>
                                      );
                                  })}
                              </div>
                          ))}
                      </div>,
                      document.body
                  )
                : null}
            {imageAnchor === undefined ? null : (
                <MediaPicker
                    current={undefined}
                    disabled={false}
                    anchor={imageAnchor}
                    onClose={() => {
                        setImageAnchor(undefined);
                        focus();
                    }}
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
            )}
            <LinkTargetSheet
                open={linking}
                onOpenChange={(next) => {
                    setLinking(next);
                    if (!next) focus();
                }}
                onPick={(target) => {
                    if (saved.current !== null) {
                        editor.send({
                            type: 'select',
                            at: saved.current,
                        });
                    }
                    editor.send({
                        type: 'insert.span',
                        text: target.label,
                        annotations: [
                            {
                                name: 'link',
                                value: {
                                    ref: target.ref,
                                },
                            },
                        ],
                    });
                    focus();
                }}
            />
        </>
    );
}
