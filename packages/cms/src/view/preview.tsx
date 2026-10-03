import { useEffect, useRef, useState, type RefObject } from 'react';
import { Monitor, MousePointerClick, Smartphone, Tablet, Hand } from 'lucide-react';
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
     * The link into draft mode the frame opens, or undefined while it is
     * being minted.
     */
    url: string | undefined;
    problem: string | undefined;
    frame: RefObject<HTMLIFrameElement | null>;
    /**
     * Whether a click in the site points at a field or follows the page.
     */
    mode: PreviewMode;
    onMode: (mode: PreviewMode) => void;
    /**
     * Whether the site's preview has said which page it shows, so clicks in
     * it reach the editor.
     */
    ready: boolean;
}

/**
 * The site's draft, rendered at a device's width and scaled to fit the pane,
 * so it shows the layout a visitor on that device sees.
 */
export function PreviewPane({ url, problem, frame, mode, onMode, ready }: PreviewPaneProps) {
    const [device, setDevice] = useState(DEVICES[0]!);
    const stage = useRef<HTMLDivElement>(null);
    const size = useSize(stage);
    const scale = size.width === 0 ? 1 : Math.min(1, size.width / device.width);
    return (
        <div className="k-preview">
            <div className="k-preview-bar">
                <div className="k-devices" role="radiogroup" aria-label="What a click does">
                    <button type="button" role="radio" aria-checked={mode === 'point'} className="k-tab" onClick={() => onMode('point')}>
                        <MousePointerClick {...ICON} />
                        Point
                    </button>
                    <button type="button" role="radio" aria-checked={mode === 'browse'} className="k-tab" onClick={() => onMode('browse')}>
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
            <div ref={stage} className="k-stage" data-ready={ready}>
                {problem !== undefined ? <p className="k-help k-stage-message">{problem}</p> : null}
                {problem === undefined && url === undefined ? <p className="k-help k-stage-message">Opening the draft</p> : null}
                {url !== undefined ? (
                    <iframe
                        ref={frame}
                        title="Draft preview"
                        src={url}
                        className="k-frame"
                        style={{
                            width: device.width,
                            height: scale === 0 ? 0 : size.height / scale,
                            transform: `scale(${scale})`,
                            left: Math.max(0, (size.width - device.width * scale) / 2),
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}
