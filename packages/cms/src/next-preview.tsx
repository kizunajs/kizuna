'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fieldElementFor, markedElements, type Source } from './source-marks.js';
import { envelope, openEnvelope, type EditorMessage, type PreviewMessage } from './preview-messages.js';
import { useLiveDraft } from './preview-live.js';

export interface PreviewOverlayProps {
    /**
     * The CMS's draft route, which renews the preview cookie and leaves draft
     * mode.
     */
    draftPath: string;
    /**
     * The CMS's draft events route, which says when a draft the page shows
     * changes.
     */
    eventsPath?: string;
    /**
     * When the preview cookie runs out, in milliseconds since the epoch, or
     * `undefined` when it already has.
     */
    expiresAt?: number;
}

/**
 * How often the preview renews its cookie, well inside the ten minutes the
 * cookie lasts.
 */
const PREVIEW_RENEW_MS = 4 * 60 * 1000;

const LAYER = 2147483000;

const FONT = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";

interface Box {
    top: number;
    left: number;
    width: number;
    height: number;
}

const boxOf = (element: Element): Box => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
    };
};

function Outline({ box, strong }: { box: Box; strong: boolean }) {
    return (
        <div
            aria-hidden="true"
            style={{
                position: 'fixed',
                top: box.top - 3,
                left: box.left - 3,
                width: box.width + 6,
                height: box.height + 6,
                zIndex: LAYER - 1,
                border: `${strong ? 2 : 1.5}px solid #0c0c0c`,
                borderRadius: '6px',
                boxShadow: '0 0 0 1.5px rgb(255 255 255 / 0.9)',
                pointerEvents: 'none',
            }}
        />
    );
}

/**
 * Calls `end` when the preview runs out, `undefined` meaning it already has.
 * A timer longer than a browser keeps fires at once, so a far one waits in
 * steps.
 */
const useExpiry = (expiresAt: number | undefined, end: () => void): void => {
    const latestEnd = useRef(end);
    latestEnd.current = end;
    useEffect(() => {
        let timer: number | undefined;
        const wait = (): void => {
            const left = expiresAt === undefined ? 0 : expiresAt - Date.now();
            if (left <= 0) {
                latestEnd.current();
                return;
            }
            timer = window.setTimeout(wait, Math.min(left, 2 ** 31 - 1));
        };
        wait();
        return () => window.clearTimeout(timer);
    }, [expiresAt]);
};

interface Renewal {
    expired: boolean;
    expiresAt: number;
}

/**
 * Events a click on a field sends, held back while pointing so a link or a
 * button around the field never acts.
 */
const HELD_EVENTS = ['click', 'dblclick', 'auxclick', 'pointerup', 'mouseup'];

/**
 * The preview inside the editor: outlines the fields, and tells the editor
 * which one was clicked and which page a link went to.
 */
function FramedPreview({ expiresAt }: { expiresAt: number | undefined }) {
    const router = useRouter();
    const pathname = usePathname();
    const [mode, setMode] = useState<'point' | 'browse'>('point');
    const [hovered, setHovered] = useState<Box | undefined>();
    const [selected, setSelected] = useState<Element | undefined>();
    const [selectedBox, setSelectedBox] = useState<Box | undefined>();
    const marked = useRef<Map<Element, Source>>(new Map());
    const [renewedAt, setRenewedAt] = useState<number | undefined>();

    const tell = useCallback((message: PreviewMessage) => {
        // The editor runs on the host's own origin, which the site cannot know ahead of time.
        window.parent.postMessage(envelope(message), '*');
    }, []);

    useEffect(() => {
        tell({
            type: 'navigated',
            path: pathname,
        });
        setSelected(undefined);
    }, [pathname, tell]);

    useEffect(() => {
        const scan = (): void => {
            marked.current = markedElements(document.body);
        };
        scan();
        let pending: number | undefined;
        const observer = new MutationObserver(() => {
            window.clearTimeout(pending);
            pending = window.setTimeout(scan, 100);
        });
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
        });
        return () => {
            observer.disconnect();
            window.clearTimeout(pending);
        };
    }, []);

    useEffect(() => {
        const listener = (event: MessageEvent): void => {
            if (event.source !== window.parent) return;
            const message = openEnvelope<EditorMessage>(event.data);
            if (message === undefined) return;
            if (message.type === 'refresh') router.refresh();
            if (message.type === 'mode') setMode(message.mode);
            if (message.type === 'renew') {
                const renewal = new URL(message.url);
                renewal.searchParams.set('renew', '1');
                void fetch(renewal, {
                    credentials: 'include',
                    cache: 'no-store',
                })
                    .then((response) => (response.ok ? (response.json() as Promise<Renewal>) : undefined))
                    .then((renewed) => {
                        if (renewed === undefined) return;
                        setRenewedAt(renewed.expiresAt);
                        if (renewed.expired) router.refresh();
                    });
            }
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [router]);

    useEffect(() => {
        const timer = window.setInterval(
            () =>
                tell({
                    type: 'renew',
                }),
            PREVIEW_RENEW_MS
        );
        return () => window.clearInterval(timer);
    }, [tell]);

    // A frame that missed its renewal, like one asleep in a background tab, asks for a fresh link at once.
    useExpiry(Math.max(expiresAt ?? 0, renewedAt ?? 0) || undefined, () =>
        tell({
            type: 'renew',
        })
    );

    useEffect(() => {
        if (mode !== 'point') {
            setHovered(undefined);
            return;
        }
        const fieldAt = (target: EventTarget | null) => (target instanceof Element ? fieldElementFor(target, marked.current) : undefined);
        const move = (event: PointerEvent): void => {
            const found = fieldAt(event.target);
            setHovered(found === undefined ? undefined : boxOf(found.element));
        };
        const hold = (event: Event): void => {
            const found = fieldAt(event.target);
            if (found === undefined) return;
            event.preventDefault();
            event.stopPropagation();
            if (event.type !== 'click') return;
            setSelected(found.element);
            tell({
                type: 'point',
                ref: found.source.ref ?? null,
                path: found.source.path,
            });
        };
        const leave = (): void => setHovered(undefined);
        document.addEventListener('pointermove', move, true);
        document.addEventListener('pointerleave', leave);
        for (const name of HELD_EVENTS) document.addEventListener(name, hold, true);
        return () => {
            document.removeEventListener('pointermove', move, true);
            document.removeEventListener('pointerleave', leave);
            for (const name of HELD_EVENTS) document.removeEventListener(name, hold, true);
        };
    }, [mode, tell]);

    useEffect(() => {
        if (selected === undefined) {
            setSelectedBox(undefined);
            return;
        }
        const measure = (): void => setSelectedBox(selected.isConnected ? boxOf(selected) : undefined);
        measure();
        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('resize', measure);
        };
    }, [selected]);

    return (
        <>
            {mode === 'point' && hovered !== undefined ? <Outline box={hovered} strong={false} /> : null}
            {selectedBox !== undefined ? <Outline box={selectedBox} strong /> : null}
            {mode === 'point' ? <style>{'body, body * { cursor: default; }'}</style> : null}
        </>
    );
}

const bar: CSSProperties = {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    zIndex: LAYER,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    height: '40px',
    padding: '0 6px 0 16px',
    borderRadius: '999px',
    background: '#141414',
    boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.06), 0 16px 40px -12px rgb(0 0 0 / 0.6)',
    color: '#ffffff',
    fontFamily: FONT,
    fontSize: '13px',
    fontWeight: 500,
    transform: 'translateX(-50%)',
    whiteSpace: 'nowrap',
};

const exitButton: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    height: '30px',
    padding: '0 12px',
    borderRadius: '999px',
    background: 'rgb(255 255 255 / 0.1)',
    color: '#ffffff',
    textDecoration: 'none',
    fontWeight: 600,
};

/**
 * The preview in a tab of its own: a bar saying so, and a way out. It lasts
 * as long as the link it opened with, renewed while the person is signed in
 * to the site as an editor, and leaves draft mode when it runs out.
 */
function StandalonePreview({ draftPath, expiresAt }: PreviewOverlayProps) {
    const pathname = usePathname();
    const [renewedAt, setRenewedAt] = useState<number | undefined>();
    const exit = `${draftPath}?disable=1&redirect=${encodeURIComponent(pathname)}`;

    useEffect(() => {
        let cancelled = false;
        const renew = async (): Promise<void> => {
            const renewed = await fetch(`${draftPath}?renew=1`, {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (cancelled || !renewed.ok) return;
            setRenewedAt(((await renewed.json()) as Renewal).expiresAt);
        };
        const timer = window.setInterval(() => void renew(), PREVIEW_RENEW_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [draftPath]);

    useExpiry(Math.max(expiresAt ?? 0, renewedAt ?? 0) || undefined, () => window.location.replace(exit));

    return (
        <div style={bar} role="status">
            <span>Draft preview</span>
            <a style={exitButton} href={exit}>
                Exit
            </a>
        </div>
    );
}

/**
 * The preview that has claimed the page. `KizunaPreview` sits in the root
 * layout and in `not-found.tsx`, and a 404 inside the layout renders both.
 */
let owner: symbol | undefined;

/**
 * The preview `KizunaPreview` renders in draft mode, in the browser only:
 * talking to the editor when it frames the page, or a bar when the page is
 * open in a tab of its own.
 */
export function PreviewOverlay(props: PreviewOverlayProps) {
    const [framed, setFramed] = useState<boolean | undefined>();
    useEffect(() => {
        if (owner !== undefined) return;
        const claim = Symbol('kizuna-cms-preview');
        owner = claim;
        setFramed(window.parent !== window);
        return () => {
            if (owner === claim) owner = undefined;
        };
    }, []);
    useLiveDraft(framed === undefined ? undefined : props.eventsPath);
    if (framed === undefined) return null;
    return framed ? <FramedPreview expiresAt={props.expiresAt} /> : <StandalonePreview {...props} />;
}
