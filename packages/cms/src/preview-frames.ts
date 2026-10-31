/**
 * The frames on a page whose document it may read, like an email rendered
 * into a frame's `srcdoc`, each with its document.
 */
export const ownFrames = (page: Document): Array<{ frame: HTMLIFrameElement; document: Document }> => {
    const frames: Array<{ frame: HTMLIFrameElement; document: Document }> = [];
    for (const frame of page.querySelectorAll('iframe')) {
        try {
            const framed = frame.contentDocument;
            if (framed !== null && framed.body !== null) {
                frames.push({
                    frame,
                    document: framed,
                });
            }
        } catch {
            // A frame on another origin keeps its document to itself.
        }
    }
    return frames;
};

/**
 * Where the page shows text: its body, and the body of each frame it may
 * read.
 */
export const shownRoots = (page: Document): Element[] => [page.body, ...ownFrames(page).map((found) => found.document.body)];

/**
 * Whether an event's target is an element, from the page or one of its
 * frames, whose elements `instanceof` does not recognise.
 */
export const isElement = (target: EventTarget | null): target is Element =>
    typeof target === 'object' && target !== null && (target as Partial<Node>).nodeType === 1;

export interface Box {
    top: number;
    left: number;
    width: number;
    height: number;
}

/**
 * Where an element sits in the viewport of `page`, the window the preview
 * draws its outlines in, counting the frames between them.
 */
export const pageBoxOf = (element: Element, page: Window): Box => {
    const rect = element.getBoundingClientRect();
    let top = rect.top;
    let left = rect.left;
    for (let view: Window | null = element.ownerDocument.defaultView; view !== null && view !== page; view = view.parent) {
        const frame = view.frameElement;
        if (frame === null) break;
        const frameRect = frame.getBoundingClientRect();
        top += frameRect.top + frame.clientTop;
        left += frameRect.left + frame.clientLeft;
    }
    return {
        top,
        left,
        width: rect.width,
        height: rect.height,
    };
};
