import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markedElements } from './source-marks.js';
import { patchTexts, type DraftChange } from './preview-patch.js';

/**
 * The documents the page marks, as `formatRef` writes them.
 */
const refsOn = (root: Element): string[] => {
    const refs = new Set<string>();
    for (const source of markedElements(root).values()) {
        if (source.ref !== undefined) refs.add(source.ref);
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
 * Follows the draft changes of what the page shows, from any caller, and puts
 * them on the page: text in place where the page marks it, and a soft refresh
 * for anything else.
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

        const refreshSoon = (): void => {
            window.clearTimeout(refresh);
            refresh = window.setTimeout(() => router.refresh(), REFRESH_DELAY_MS);
        };

        const connect = (): void => {
            const refs = refsOn(document.body);
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
                if (!patchTexts(document.body, change)) refreshSoon();
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

        connect();
        // The documents the page shows change as it renders again, and a stream waiting to reconnect picks them up then.
        let pending: number | undefined;
        const observer = new MutationObserver(() => {
            window.clearTimeout(pending);
            pending = window.setTimeout(() => {
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
            observer.disconnect();
            source?.close();
            window.clearTimeout(pending);
            window.clearTimeout(reconnect);
            window.clearTimeout(refresh);
        };
    }, [eventsPath, pathname, router]);
};
