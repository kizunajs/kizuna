import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { LoaderCircle } from 'lucide-react';
import { envelope, openEnvelope, type EditorMessage, type PreviewMessage } from '../preview-messages.js';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { DeviceSelect, frameStyleOf, type DeviceKey } from '../view/devices.js';
import { problemOf } from './parts.js';

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

/**
 * The site in draft mode, framed beside the fields. The site follows the
 * drafts itself through its live updates, so a save shows without the admin
 * telling it. A click on a field in the page points at it in the form.
 */
export function AdminPreview({
    connection,
    siteUrl,
    path,
    onPoint,
}: {
    connection: Connection;
    /**
     * The site's origin, which the framed page's messages come from.
     */
    siteUrl: string;
    /**
     * The page the frame opens on.
     */
    path: string;
    /**
     * A click on a field, with the page the frame showed when it came.
     */
    onPoint: (ref: string | null, fieldPath: string, framedPath: string | undefined) => void;
}) {
    const [url, setUrl] = useState<string | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [loaded, setLoaded] = useState(false);
    const [device, setDevice] = useState<DeviceKey>('desktop');
    const frame = useRef<HTMLIFrameElement>(null);
    const framed = useRef<string | undefined>(undefined);
    const stage = useRef<HTMLDivElement>(null);
    const size = useSize(stage);
    const latestPoint = useRef(onPoint);
    latestPoint.current = onPoint;

    const mint = useCallback(
        async (landing: string): Promise<string | undefined> => {
            const answer = await connection.call<{ url: string }>('editing_create_preview', {
                body: {
                    path: landing,
                },
            });
            if (answer.status !== 200) {
                setProblem(problemOf(answer, 'The draft could not be opened'));
                return undefined;
            }
            setProblem(undefined);
            return answer.body.url;
        },
        [connection]
    );

    useEffect(() => {
        let cancelled = false;
        setLoaded(false);
        void mint(path).then((minted) => {
            if (!cancelled && minted !== undefined) setUrl(minted);
        });
        return () => {
            cancelled = true;
        };
    }, [mint, path]);

    const tell = useCallback(
        (message: EditorMessage): void => {
            frame.current?.contentWindow?.postMessage(envelope(message), siteUrl);
        },
        [siteUrl]
    );

    // What the framed site says: where it went, what was clicked, and when its cookie runs out.
    useEffect(() => {
        const listener = (event: MessageEvent): void => {
            if (event.origin !== siteUrl || event.source !== frame.current?.contentWindow) return;
            const message = openEnvelope<PreviewMessage>(event.data);
            if (message === undefined) return;
            if (message.type === 'navigated') {
                framed.current = message.path;
                tell({
                    type: 'mode',
                    mode: 'point',
                });
                return;
            }
            if (message.type === 'renew') {
                void mint(framed.current ?? path).then((minted) => {
                    if (minted !== undefined) {
                        tell({
                            type: 'renew',
                            url: minted,
                        });
                    }
                });
                return;
            }
            latestPoint.current(message.ref, message.path, framed.current);
        };
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [siteUrl, mint, tell, path]);

    return (
        <div className="k-preview k-preview--admin">
            <div className="k-preview__bar">
                <span className="k-help">Your site, in draft mode</span>
                <DeviceSelect value={device} onChange={setDevice} />
            </div>
            <div ref={stage} className="k-preview__stage" aria-busy={!loaded}>
                {problem !== undefined ? <p className="k-help k-preview__message">{problem}</p> : null}
                {problem === undefined && !loaded ? (
                    <div className="k-preview__message" role="status" aria-label="Loading the draft">
                        <LoaderCircle {...ICON} className="k-spin" />
                    </div>
                ) : null}
                {url !== undefined ? (
                    <iframe
                        ref={frame}
                        title="Draft preview"
                        src={url}
                        className="k-preview__frame"
                        onLoad={() => setLoaded(true)}
                        style={{
                            ...frameStyleOf(device, size),
                            visibility: loaded ? 'visible' : 'hidden',
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}
