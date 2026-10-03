import { vercelStegaDecode } from '@vercel/stega';

/**
 * What the CMS's hidden marks say they came from, so other tools' marks are
 * ignored.
 */
export const SOURCE_ORIGIN = 'kizuna-cms';

export interface SourcePayload {
    origin: string;
    ref?: string;
    path: string;
}

/**
 * Where a rendered value came from: the document, and the field within it.
 */
export interface Source {
    ref: string | undefined;
    path: string;
}

/**
 * The document and field path hidden in a string, or `undefined`.
 */
export const decodeSource = (text: string): Source | undefined => {
    const payload = vercelStegaDecode<Partial<SourcePayload>>(text);
    if (payload?.origin !== SOURCE_ORIGIN || typeof payload.path !== 'string') return undefined;
    return {
        ref: typeof payload.ref === 'string' ? payload.ref : undefined,
        path: payload.path,
    };
};

/**
 * The marker an image URL carries in draft mode, followed by the field path,
 * and the document after a `@`.
 */
export const IMAGE_MARKER = '#kizuna-cms=';

/**
 * The source an image URL's fragment names.
 */
export const decodeImageSource = (fragment: string): Source => {
    const [path, ref] = decodeURIComponent(fragment).split('@');
    return {
        ref: ref === undefined || ref === '' ? undefined : ref,
        path: path ?? '',
    };
};

const imageSource = (image: Element, base: string): Source | undefined => {
    const src = image.getAttribute('src') ?? '';
    const direct = src.indexOf(IMAGE_MARKER);
    if (direct >= 0) return decodeImageSource(src.slice(direct + IMAGE_MARKER.length));
    try {
        // next/image passes the source through its loader as `?url=`.
        const inner = new URL(src, base).searchParams.get('url') ?? '';
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
 * attribute, or an image.
 */
export const markedElements = (root: Element): Map<Element, Source> => {
    const marked = new Map<Element, Source>();
    const owner = root.ownerDocument;
    const walker = owner.createTreeWalker(root, 4);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (parent === null || marked.has(parent)) continue;
        const source = decodeSource(node.nodeValue ?? '');
        if (source !== undefined) marked.set(parent, source);
    }
    for (const element of root.querySelectorAll('img, [placeholder], [aria-label], [title], [value]')) {
        if (marked.has(element)) continue;
        const source =
            element.tagName === 'IMG'
                ? imageSource(element, owner.baseURI)
                : MARKED_ATTRIBUTES.map((name) => decodeSource(element.getAttribute(name) ?? '')).find((found) => found !== undefined);
        if (source !== undefined) marked.set(element, source);
    }
    return marked;
};

/**
 * The nearest element from the target up that holds a value, with its source.
 */
export const fieldElementFor = (target: Element, marked: Map<Element, Source>): { element: Element; source: Source } | undefined => {
    const body = target.ownerDocument.body;
    for (let element: Element | null = target; element !== null && element !== body; element = element.parentElement) {
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
