import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { watchPage } from './page-events.js';
import { ExternalLink, Hand, Monitor, MousePointerClick, Smartphone, Tablet, X } from 'lucide-react';
import { ICON } from './context.js';

/**
 * The widths the site renders at, scaled down to the pane.
 */
const DEVICES = [
    {
        key: 'desktop',
        label: 'Desktop',
        width: 1280,
        Icon: Monitor,
    },
    {
        key: 'tablet',
        label: 'Tablet',
        width: 768,
        Icon: Tablet,
    },
    {
        key: 'phone',
        label: 'Phone',
        width: 390,
        Icon: Smartphone,
    },
];

const useSize = (element: RefObject<HTMLElement | null>): { width: number; height: number } => {
    const [size, setSize] = useState({
        width: 0,
        height: 0,
    });
    useEffect(() => {
        const target = element.current;
        if (target === null) return;
        const observer = new ResizeObserver(([entry]) => {
            if (entry === undefined) return;
            setSize({
                width: entry.contentRect.width,
                height: entry.contentRect.height,
            });
        });
        observer.observe(target);
        return () => observer.disconnect();
    }, [element]);
    return size;
};

export type PreviewMode = 'point' | 'browse';

export interface PreviewPaneProps {
    /**
     * The link into draft mode a live frame opens, for a host that lets the
     * editor frame the site.
     */
    url: string | undefined;
    /**
     * The page as one document, for a host that does not.
     */
    snapshot: string | undefined;
    problem: string | undefined;
    frame: RefObject<HTMLIFrameElement | null>;
    /**
     * On, a click in the site picks a field. Off, the site behaves as it does
     * in a browser.
     */
    selecting: boolean;
    onSelecting: (selecting: boolean) => void;
    /**
     * A link that turned out to be a file, such as a PDF, which the preview
     * does not show.
     */
    notice: { path: string; type: string } | undefined;
    onDismissNotice: () => void;
    /**
     * Opens a URL in a browser tab, through the host.
     */
    onOpenLink: (url: string) => void;
    /**
     * Whether the preview has said which page it shows, so clicks in it reach
     * the editor.
     */
    ready: boolean;
    /**
     * A click on a field in the snapshot. A live frame tells the editor itself.
     */
    onPoint: (ref: string | null, path: string) => void;
    /**
     * A click on a link to another page of the site, in the snapshot.
     */
    onNavigate: (path: string) => void;
    /**
     * A render of the page is on its way.
     */
    loading: boolean;
}

/**
 * Paths that name a file rather than a page.
 */
const FILE = /\.(?:pdf|zip|gz|rar|7z|docx?|xlsx?|pptx?|csv|txt|json|xml|png|jpe?g|gif|webp|avif|svg|ico|mp4|mov|webm|mp3|wav|woff2?)$/i;

/**
 * The page's draft in a frame the editor writes, running its own scripts. The
 * editor listens to it directly: a click on a field points at it, and a link
 * to another page loads that page's draft.
 */
function SnapshotFrame(props: {
    html: string;
    siteUrl: string;
    frame: RefObject<HTMLIFrameElement | null>;
    selecting: boolean;
    onPoint: (ref: string | null, path: string) => void;
    onNavigate: (path: string) => void;
    onOpenLink: (url: string) => void;
    /**
     * The document loaded and the editor listens to it.
     */
    onAttached: () => void;
    style: CSSProperties;
}) {
    const selecting = useRef(props.selecting);
    selecting.current = props.selecting;
    const callbacks = useRef(props);
    callbacks.current = props;
    const scrolled = useRef(0);

    const attach = (): void => {
        const document = props.frame.current?.contentDocument;
        if (document === null || document === undefined || document.body === null) return;
        document.defaultView?.scrollTo(0, scrolled.current);
        document.addEventListener('scroll', () => {
            scrolled.current = document.defaultView?.scrollY ?? 0;
        });
        watchPage(document, {
            selecting: () => selecting.current,
            onPoint: (ref, path) => callbacks.current.onPoint(ref, path),
            onBrowse: (event, element) => {
                const link = element.closest('a[href]');
                if (link === null) return;
                // A frame the editor wrote cannot navigate itself, so the editor loads the next page.
                event.preventDefault();
                event.stopPropagation();
                const href = link.getAttribute('href') ?? '';
                if (href.startsWith('#')) return;
                const target = new URL(href, callbacks.current.siteUrl);
                const elsewhere = target.origin !== new URL(callbacks.current.siteUrl).origin;
                // A file, a download or another site opens in a tab, since the preview shows pages of this site.
                if (elsewhere || link.hasAttribute('download') || link.getAttribute('target') === '_blank' || FILE.test(target.pathname)) {
                    if (/^https?:$/.test(target.protocol)) callbacks.current.onOpenLink(target.toString());
                    return;
                }
                scrolled.current = 0;
                callbacks.current.onNavigate(`${target.pathname}${target.search}`);
            },
        });
        callbacks.current.onAttached();
    };

    // The page shares the editor's origin, so it runs nothing: no scripts, no forms, no popups. The editor reads it and listens to it from outside.
    return (
        <iframe
            ref={props.frame}
            title="Draft preview"
            srcDoc={props.html}
            sandbox="allow-same-origin"
            className="k-frame"
            style={props.style}
            onLoad={attach}
        />
    );
}

/**
 * The site's draft, rendered at a device's width and scaled to fit the pane,
 * so it shows the layout a visitor on that device sees.
 */
export function PreviewPane(props: PreviewPaneProps & { siteUrl: string }) {
    const { url, snapshot, problem, frame, selecting, onSelecting, ready, loading } = props;
    const [device, setDevice] = useState(DEVICES[0]!);
    const stage = useRef<HTMLDivElement>(null);
    const size = useSize(stage);
    const scale = size.width === 0 ? 1 : Math.min(1, size.width / device.width);
    // A snapshot is ready once its document loads and the editor listens to it.
    const [attached, setAttached] = useState<string | undefined>();
    const shown = url === undefined ? snapshot !== undefined && attached === snapshot : ready;
    // Until the first page is ready, the pane keeps the editor's background and a skeleton. After that, a reload keeps the page on screen.
    const [everShown, setEverShown] = useState(false);
    useEffect(() => {
        if (shown) setEverShown(true);
    }, [shown]);
    const frameStyle: CSSProperties = {
        visibility: everShown || shown ? 'visible' : 'hidden',
        width: device.width,
        height: scale === 0 ? 0 : size.height / scale,
        transform: `scale(${scale})`,
        left: Math.max(0, (size.width - device.width * scale) / 2),
    };
    return (
        <div className="k-preview">
            <div className="k-preview-bar">
                <div className="k-devices" role="radiogroup" aria-label="What a click does">
                    <button type="button" role="radio" aria-checked={selecting} className="k-tab" onClick={() => onSelecting(true)}>
                        <MousePointerClick {...ICON} />
                        Point
                    </button>
                    <button type="button" role="radio" aria-checked={!selecting} className="k-tab" onClick={() => onSelecting(false)}>
                        <Hand {...ICON} />
                        Browse
                    </button>
                </div>
                <div className="k-devices" role="radiogroup" aria-label="Preview width">
                    {DEVICES.map((candidate) => (
                        <button
                            key={candidate.key}
                            type="button"
                            role="radio"
                            aria-checked={candidate.key === device.key}
                            className="k-tab"
                            onClick={() => setDevice(candidate)}>
                            <candidate.Icon {...ICON} />
                            {candidate.label}
                        </button>
                    ))}
                </div>
            </div>
            {props.notice !== undefined ? (
                <div className="k-notice" role="status">
                    <span>
                        {props.notice.path} opens {props.notice.type === 'application/pdf' ? 'a PDF' : `a file (${props.notice.type})`},
                        which the preview does not show.
                    </span>
                    <button
                        type="button"
                        className="k-button k-button-secondary k-button-small"
                        onClick={() => props.onOpenLink(new URL(props.notice!.path, props.siteUrl).toString())}>
                        <ExternalLink {...ICON} />
                        Open in a tab
                    </button>
                    <button type="button" className="k-icon-button" onClick={props.onDismissNotice} aria-label="Dismiss">
                        <X {...ICON} />
                    </button>
                </div>
            ) : null}
            <div ref={stage} className="k-stage" data-ready={shown} data-loading={loading && everShown} aria-busy={loading}>
                {loading && snapshot !== undefined ? (
                    <div className="k-progress" role="progressbar" aria-label="Loading the draft" />
                ) : null}
                {problem !== undefined ? <p className="k-help k-stage-message">{problem}</p> : null}
                {problem === undefined && !everShown && !shown ? (
                    <div className="k-loading" role="status" aria-label="Loading the draft">
                        <div
                            className="k-skeleton"
                            style={{
                                width: '38%',
                                height: 14,
                            }}
                        />
                        <div
                            className="k-skeleton"
                            style={{
                                width: '100%',
                                height: 220,
                            }}
                        />
                        <div
                            className="k-skeleton"
                            style={{
                                width: '62%',
                                height: 26,
                            }}
                        />
                        <div
                            className="k-skeleton"
                            style={{
                                width: '84%',
                                height: 12,
                            }}
                        />
                        <div
                            className="k-skeleton"
                            style={{
                                width: '70%',
                                height: 12,
                            }}
                        />
                    </div>
                ) : null}
                {url !== undefined ? <iframe ref={frame} title="Draft preview" src={url} className="k-frame" style={frameStyle} /> : null}
                {url === undefined && snapshot !== undefined ? (
                    <SnapshotFrame
                        html={snapshot}
                        siteUrl={props.siteUrl}
                        frame={frame}
                        selecting={selecting}
                        onPoint={props.onPoint}
                        onNavigate={props.onNavigate}
                        onOpenLink={props.onOpenLink}
                        onAttached={() => setAttached(snapshot)}
                        style={frameStyle}
                    />
                ) : null}
            </div>
        </div>
    );
}
