import { fieldElementFor, markedElements } from '../source-marks.js';

const OUTLINE_STYLE = `
.kizuna-cms-outline {
    position: absolute;
    z-index: 2147483000;
    border: 1.5px solid #0c0c0c;
    border-radius: 6px;
    box-shadow: 0 0 0 1.5px rgb(255 255 255 / 0.9);
    pointer-events: none;
}
.kizuna-cms-outline[data-selected] {
    border-width: 2px;
}
`;

/**
 * Puts an outline around an element, inside the snapshot, so it scrolls and
 * scales with the page.
 */
const outline = (document: Document, element: Element | undefined, selected: boolean): void => {
    const name = selected ? 'kizuna-cms-selected' : 'kizuna-cms-hovered';
    let box = document.getElementById(name);
    if (element === undefined) {
        box?.remove();
        return;
    }
    if (box === null) {
        box = document.createElement('div');
        box.id = name;
        box.className = 'kizuna-cms-outline';
        if (selected) box.dataset['selected'] = '';
        document.body.append(box);
    }
    const rect = element.getBoundingClientRect();
    const view = document.defaultView;
    box.style.top = `${rect.top + (view?.scrollY ?? 0) - 3}px`;
    box.style.left = `${rect.left + (view?.scrollX ?? 0) - 3}px`;
    box.style.width = `${rect.width + 6}px`;
    box.style.height = `${rect.height + 6}px`;
};

export interface PageWatch {
    /**
     * Whether a click picks a field, rather than acting on the page.
     */
    selecting: () => boolean;
    onPoint: (ref: string | null, path: string) => void;
    /**
     * A click while browsing, on the element it landed on.
     */
    onBrowse: (event: MouseEvent, element: Element) => void;
    /**
     * Scrolling while browsing, for a page that scrolls somewhere else.
     */
    onWheel?: (event: WheelEvent) => void;
}

/**
 * Listens to a page the editor shows: outlines the fields under the pointer,
 * points at the one clicked, hands other clicks to `onBrowse`, and reads the
 * fields again as the page changes. The page itself runs nothing.
 */
export const watchPage = (document: Document, watch: PageWatch): void => {
    if (document.body === null) return;
    const style = document.createElement('style');
    style.textContent = OUTLINE_STYLE;
    document.head?.append(style);
    let marked = markedElements(document.body);
    let pending: number | undefined;
    new (document.defaultView?.MutationObserver ?? MutationObserver)(() => {
        window.clearTimeout(pending);
        pending = window.setTimeout(() => {
            marked = markedElements(document.body);
        }, 120);
    }).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
    });
    const elementOf = (target: EventTarget | null): Element | undefined => {
        const node = target as Node | null;
        if (node === null || !('nodeType' in node)) return undefined;
        return node.nodeType === 1 ? (node as Element) : (node.parentElement ?? undefined);
    };
    const fieldAt = (target: EventTarget | null) => {
        const element = elementOf(target);
        return element === undefined ? undefined : fieldElementFor(element, marked);
    };
    document.addEventListener('pointermove', (event) => {
        outline(document, watch.selecting() ? fieldAt(event.target)?.element : undefined, false);
    });
    document.addEventListener('pointerleave', () => outline(document, undefined, false));
    document.addEventListener(
        'click',
        (event) => {
            const element = elementOf(event.target);
            if (element === undefined) return;
            if (watch.selecting()) {
                event.preventDefault();
                event.stopPropagation();
                const found = fieldElementFor(element, marked);
                if (found === undefined) return;
                outline(document, found.element, true);
                watch.onPoint(found.source.ref ?? null, found.source.path);
                return;
            }
            watch.onBrowse(event, element);
        },
        true
    );
    if (watch.onWheel !== undefined) {
        document.addEventListener(
            'wheel',
            (event) => {
                event.preventDefault();
                watch.onWheel!(event);
            },
            {
                passive: false,
            }
        );
    }
    document.addEventListener('submit', (event) => event.preventDefault(), true);
};
