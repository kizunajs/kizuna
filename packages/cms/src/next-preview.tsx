'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { fieldElementFor, markedElements, type Source } from './source-marks.js';
import { envelope, openEnvelope, type EditorMessage, type PreviewMessage } from './preview-messages.js';

export interface PreviewOverlayProps {
    /**
     * The CMS's draft route, which renews the preview cookie and leaves draft
     * mode.
     */
    draftPath: string;
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
 * Events a click on a field sends, held back while pointing so a link or a
 * button around the field never acts.
 */
const HELD_EVENTS = ['click', 'dblclick', 'auxclick', 'pointerup', 'mouseup'];

/**
 * The preview inside the editor: outlines the fields, and tells the editor
 * which one was clicked and which page a link went to.
 */
function FramedPreview() {
    const router = useRouter();
    const pathname = usePathname();
    const [mode, setMode] = useState<'point' | 'browse'>('point');
    const [hovered, setHovered] = useState<Box | undefined>();
    const [selected, setSelected] = useState<Element | undefined>();
    const [selectedBox, setSelectedBox] = useState<Box | undefined>();
    const marked = useRef<Map<Element, Source>>(new Map());

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
                    .then((response) => (response.ok ? (response.json() as Promise<{ expired: boolean }>) : undefined))
                    .then((renewed) => {
                        if (renewed?.expired === true) router.refresh();
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
 * The preview in a tab of its own: a bar saying so, and a way out. The editor
 * is in the chat, so nothing here edits.
 */
function StandalonePreview({ draftPath }: PreviewOverlayProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [expired, setExpired] = useState(false);

    // Renewing takes a signed-in editor. A tab opened from the chat has none, so its drafts stop when the link runs out.
    useEffect(() => {
        let cancelled = false;
        const renew = async (): Promise<void> => {
            const renewed = await fetch(`${draftPath}?renew=1`, {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            if (cancelled) return;
            if (!renewed.ok) {
                setExpired(true);
                return;
            }
            const { expired: lapsed } = (await renewed.json()) as { expired: boolean };
            if (lapsed) router.refresh();
        };
        const timer = window.setInterval(() => void renew(), PREVIEW_RENEW_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [draftPath, router]);

    return (
        <div style={bar} role="status">
            <span>{expired ? 'Draft preview ended. Open it again from the chat.' : 'Draft preview'}</span>
            <a style={exitButton} href={`${draftPath}?disable=1&redirect=${encodeURIComponent(pathname)}`}>
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
    if (framed === undefined) return null;
    return framed ? <FramedPreview /> : <StandalonePreview {...props} />;
}
