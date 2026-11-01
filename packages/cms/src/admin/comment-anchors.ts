import { fieldDomId } from '../view/form.js';

/**
 * Where a field's text is typed or shown: an input or a textarea, which
 * hold it as their value, or an element whose text nodes hold it, like rich
 * text's editable or a locked field's text.
 */
export type TextTarget =
    | {
          kind: 'value';
          element: HTMLInputElement | HTMLTextAreaElement;
      }
    | {
          kind: 'nodes';
          element: HTMLElement;
      };

const TEXT_INPUTS = new Set(['text', 'search', 'email', 'url']);

/**
 * The text of the field at `path`, as the form draws it, or `undefined` for
 * a field that shows no text.
 */
export const textTargetOf = (path: string): TextTarget | undefined => {
    const section = document.getElementById(fieldDomId(path));
    if (section === null) return undefined;
    const input = document.getElementById(`${fieldDomId(path)}-input`);
    if (input instanceof HTMLTextAreaElement || (input instanceof HTMLInputElement && TEXT_INPUTS.has(input.type))) {
        return {
            kind: 'value',
            element: input,
        };
    }
    const nodes = section.querySelector<HTMLElement>('.k-rich__editable, .k-read-only__text');
    return nodes === null
        ? undefined
        : {
              kind: 'nodes',
              element: nodes,
          };
};

/**
 * The field a node sits in, by the path whose section holds it.
 */
export const fieldOfNode = (node: Node, paths: readonly string[]): string | undefined => {
    const element = node instanceof Element ? node : node.parentElement;
    const section = element?.closest('section.k-field');
    if (section === null || section === undefined) return undefined;
    return paths.find((path) => fieldDomId(path) === section.id);
};

/**
 * The text nodes an element shows, each with where its text starts in all
 * of them run together. Blocks inside rich text that are not text, and the
 * empty markers an editor keeps, are left out.
 */
export const textNodesOf = (root: HTMLElement): { text: string; nodes: Array<{ node: Text; start: number }> } => {
    const nodes: Array<{ node: Text; start: number }> = [];
    let text = '';
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            const parent = node.parentElement;
            if (parent === null || parent.closest('[contenteditable="false"], [data-slate-zero-width]') !== null)
                return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        nodes.push({
            node: node as Text,
            start: text.length,
        });
        text += node.textContent ?? '';
    }
    return {
        text,
        nodes,
    };
};

/**
 * A DOM range over the characters from `start` to `end` of the text nodes.
 */
export const rangeOver = (nodes: ReadonlyArray<{ node: Text; start: number }>, start: number, end: number): Range | undefined => {
    const at = (offset: number): { node: Text; offset: number } | undefined => {
        for (const entry of nodes) {
            const length = entry.node.textContent?.length ?? 0;
            if (offset <= entry.start + length) {
                return {
                    node: entry.node,
                    offset: offset - entry.start,
                };
            }
        }
        return undefined;
    };
    const from = at(start);
    const to = at(end);
    if (from === undefined || to === undefined) return undefined;
    const range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    return range;
};

/**
 * Where a point in the text nodes falls in them run together.
 */
export const offsetIn = (nodes: ReadonlyArray<{ node: Text; start: number }>, node: Node, offset: number): number | undefined => {
    const found = nodes.find((entry) => entry.node === node);
    return found === undefined ? undefined : found.start + offset;
};

/**
 * The styles a copy of an input needs to lay its text out the same.
 */
const COPIED = [
    'boxSizing',
    'width',
    'height',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'borderTopStyle',
    'borderRightStyle',
    'borderBottomStyle',
    'borderLeftStyle',
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'fontStretch',
    'letterSpacing',
    'wordSpacing',
    'textTransform',
    'textIndent',
    'tabSize',
] satisfies Array<keyof CSSStyleDeclaration>;

/**
 * Styles a layer over an input so its text lays out where the input's does:
 * one line centred for an input, wrapped lines for a textarea.
 */
export const copyLayout = (element: HTMLInputElement | HTMLTextAreaElement, layer: HTMLElement): void => {
    const style = window.getComputedStyle(element);
    for (const property of COPIED) layer.style[property] = style[property];
    layer.style.borderColor = 'transparent';
    if (element instanceof HTMLInputElement) {
        layer.style.whiteSpace = 'pre';
        layer.style.lineHeight = `${element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`;
    } else {
        layer.style.whiteSpace = 'pre-wrap';
        layer.style.overflowWrap = 'break-word';
        layer.style.lineHeight = style.lineHeight;
    }
};

/**
 * Where the character at `offset` of an input's value sits on the screen,
 * measured on a hidden copy laid out the same.
 */
export const caretRectOf = (element: HTMLInputElement | HTMLTextAreaElement, offset: number): DOMRect => {
    const copy = document.createElement('div');
    copyLayout(element, copy);
    copy.style.position = 'absolute';
    copy.style.visibility = 'hidden';
    copy.style.top = '0';
    copy.style.left = '-9999px';
    copy.style.overflow = 'hidden';
    copy.textContent = element.value.slice(0, offset);
    const marker = document.createElement('span');
    marker.textContent = element.value.slice(offset) || '.';
    copy.append(marker);
    document.body.append(copy);
    const box = element.getBoundingClientRect();
    const copyBox = copy.getBoundingClientRect();
    const markerBox = marker.getClientRects()[0] ?? marker.getBoundingClientRect();
    copy.remove();
    return new DOMRect(
        box.left + (markerBox.left - copyBox.left) - element.scrollLeft,
        box.top + (markerBox.top - copyBox.top) - element.scrollTop,
        0,
        markerBox.height
    );
};

interface HighlightRegistry {
    set: (name: string, highlight: unknown) => void;
    delete: (name: string) => void;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

/**
 * The names the stylesheet draws the marked phrases under, as
 * `::highlight(k-comment)`, and the open thread's as
 * `::highlight(k-comment-active)`.
 */
const HIGHLIGHTS = {
    quiet: 'k-comment',
    active: 'k-comment-active',
};

const marked = {
    quiet: new Map<string, Range[]>(),
    active: new Map<string, Range[]>(),
};

/**
 * Marks the phrases of one field's text with the browser's highlights,
 * which draw over the text without touching an editor's own elements: the
 * open thread's apart from the rest. No ranges clears the field's.
 */
export const markRanges = (path: string, quiet: readonly Range[], active: readonly Range[]): void => {
    const registry = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS?.highlights;
    const Highlight = (globalThis as { Highlight?: HighlightConstructor }).Highlight;
    if (registry === undefined || Highlight === undefined) return;
    for (const [kind, ranges] of [
        ['quiet', quiet],
        ['active', active],
    ] satisfies Array<[keyof typeof HIGHLIGHTS, readonly Range[]]>) {
        if (ranges.length === 0) marked[kind].delete(path);
        else marked[kind].set(path, [...ranges]);
        const all = [...marked[kind].values()].flat();
        if (all.length === 0) registry.delete(HIGHLIGHTS[kind]);
        else registry.set(HIGHLIGHTS[kind], new Highlight(...all));
    }
};
