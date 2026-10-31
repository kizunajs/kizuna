import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markedElements } from './source-marks.js';
import { patchTexts, type DraftChange } from './preview-patch.js';
import { openEnvelope, type EditorMessage } from './preview-messages.js';

/**
 * Where the page shows text: its body, and the body of each frame on its own
 * origin, like an email rendered into a frame's `srcdoc`.
 */
const shownRoots = (): Element[] => {
    const roots: Element[] = [document.body];
    for (const frame of document.querySelectorAll('iframe')) {
        try {
            const body = frame.contentDocument?.body;
            if (body !== undefined && body !== null) roots.push(body);
        } catch {
            // A frame on another origin keeps its document to itself.
        }
    }
    return roots;
};

/**
 * Patches the change wherever the page shows it, answering whether any part
 * of the page took it.
 */
const patchShown = (change: DraftChange): boolean => shownRoots().filter((root) => patchTexts(root, change)).length > 0;

/**
 * The documents the page marks, as `formatRef` writes them.
 */
const refsOn = (): string[] => {
    const refs = new Set<string>();
    for (const root of shownRoots()) {
        for (const source of markedElements(root).values()) {
            if (source.ref !== undefined) refs.add(source.ref);
        }
    }
    return [...refs].sort();
};

/**
 * How long a closed stream waits before it opens again, doubling up to the
 * longest.
 */
const RECONNECT_MS = 2000;
const RECONNECT_MAX_MS = 60_000;

/**
 * Coalesces the refreshes a burst of saves asks for, like autosave while
 * someone types.
 */
const REFRESH_DELAY_MS = 150;

/**
 * Text the editor framing the page says the person typed, by document and
 * path, held until the draft events bring the same text.
 */
type Typed = Map<string, Record<string, string>>;

/**
 * Puts each typed text in place, one path at a time, so a path the page does
 * not show as text of its own leaves the others shown.
 */
const showTyped = (typed: Typed): void => {
    for (const [ref, texts] of typed) {
        for (const [path, text] of Object.entries(texts)) {
            patchShown({
                ref,
                texts: {
                    [path]: text,
                },
            });
        }
    }
};

/**
 * Drops the typed text a change confirms. A change that renders the page
 * again saved everything typed before it, so it drops the document's.
 */
const confirmTyped = (typed: Typed, change: DraftChange): void => {
    const held = typed.get(change.ref);
    if (held === undefined) return;
    if (change.texts === null) {
        typed.delete(change.ref);
        return;
    }
    for (const [path, text] of Object.entries(change.texts)) {
        if (held[path] === text) delete held[path];
    }
    if (Object.keys(held).length === 0) typed.delete(change.ref);
};

/**
 * Follows the draft changes of what the page shows, from any caller, and puts
 * them on the page: text in place where the page marks it, and a soft refresh
 * for anything else. Inside the editor, the text the person types shows at
 * once, before it saves.
 */
export const useLiveDraft = (eventsPath: string | undefined): void => {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (eventsPath === undefined || typeof EventSource === 'undefined') return;
        let source: EventSource | undefined;
        let subscribed: string | undefined;
        let reconnect: number | undefined;
        let delay = RECONNECT_MS;
        let dropped = false;
        let refresh: number | undefined;
        let stopped = false;
        const typed: Typed = new Map();

        const refreshSoon = (): void => {
            window.clearTimeout(refresh);
            refresh = window.setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
        };

        const connect = (): void => {
            const refs = refsOn();
            const key = refs.join(' ');
            if (source !== undefined && key === subscribed) return;
            source?.close();
            window.clearTimeout(reconnect);
            subscribed = key;
            const url = new URL(eventsPath, window.location.href);
            url.searchParams.set('path', pathname);
            for (const ref of refs) url.searchParams.append('refs', ref);
            const opened = new EventSource(url);
            source = opened;
            opened.addEventListener('open', () => {
                delay = RECONNECT_MS;
                // Saves made while the stream was down never reached the page.
                if (dropped) refreshSoon();
                dropped = false;
            });
            opened.addEventListener('change', (event) => {
                const change = JSON.parse((event as MessageEvent<string>).data) as DraftChange;
                confirmTyped(typed, change);
                if (!patchShown(change)) refreshSoon();
                // A save that left with the text typed so far arrives after the person typed more.
                showTyped(typed);
            });
            opened.addEventListener('error', () => {
                dropped = true;
                // The browser reconnects a dropped stream itself, but gives up on a refusal.
                if (opened.readyState !== EventSource.CLOSED || stopped) return;
                source = undefined;
                reconnect = window.setTimeout(connect, delay);
                delay = Math.min(delay * 2, RECONNECT_MAX_MS);
            });
        };

        const typing = (event: MessageEvent): void => {
            if (window.parent === window || event.source !== window.parent) return;
            const message = openEnvelope<EditorMessage>(event.data);
            if (message?.type !== 'draft' || message.change.texts === null) return;
            typed.set(message.change.ref, {
                ...typed.get(message.change.ref),
                ...message.change.texts,
            });
            showTyped(typed);
        };
        window.addEventListener('message', typing);
        // A frame on the page loads its document again when the page renders again.
        const frameLoaded = (event: Event): void => {
            if (event.target instanceof HTMLIFrameElement) showTyped(typed);
        };
        document.addEventListener('load', frameLoaded, true);

        connect();
        // The documents the page shows change as it renders again, and a stream waiting to reconnect picks them up then.
        let pending: number | undefined;
        const observer = new MutationObserver(() => {
            window.clearTimeout(pending);
            pending = window.setTimeout(() => {
                showTyped(typed);
                if (source !== undefined) connect();
            }, 300);
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
        });
        return () => {
            stopped = true;
            window.removeEventListener('message', typing);
            document.removeEventListener('load', frameLoaded, true);
            observer.disconnect();
            source?.close();
            window.clearTimeout(pending);
            window.clearTimeout(reconnect);
            window.clearTimeout(refresh);
        };
    }, [eventsPath, pathname, router]);
};
