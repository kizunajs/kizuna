import { useEffect, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CircleAlert, LoaderCircle, WifiOff } from 'lucide-react';
import { ICON } from '../view/context.js';

/**
 * How often a draft that could not reach the CMS tries again on its own.
 */
export const RETRY_MS = 10_000;

/**
 * Why the draft did not save, as the header tells it.
 */
export interface SaveProblem {
    detail: string;
    /**
     * The CMS could not be reached or failed itself, so trying again may work.
     */
    unreachable: boolean;
}

/**
 * Whether a save that failed with this status is worth sending again as it
 * is: a request that never arrived, or a server that failed. A refusal of the
 * values themselves is not.
 */
export const retriesSave = (status: number): boolean => status !== 409 && status !== 422;

/**
 * Whether the browser is online, following it as it changes.
 */
export const useOnline = (): boolean => {
    const [online, setOnline] = useState(() => window.navigator.onLine);
    useEffect(() => {
        const follow = (): void => setOnline(window.navigator.onLine);
        window.addEventListener('online', follow);
        window.addEventListener('offline', follow);
        return () => {
            window.removeEventListener('online', follow);
            window.removeEventListener('offline', follow);
        };
    }, []);
    return online;
};

/**
 * Sends the draft again while it could not reach the CMS: at once when the
 * browser comes back online, and every few seconds while it is.
 */
export const useRetry = (problem: SaveProblem | undefined, online: boolean, retry: () => void): void => {
    const waiting = problem?.unreachable === true;
    useEffect(() => {
        if (!waiting) return;
        window.addEventListener('online', retry);
        const timer = online ? window.setInterval(retry, RETRY_MS) : undefined;
        return () => {
            window.removeEventListener('online', retry);
            window.clearInterval(timer);
        };
    }, [waiting, online, retry]);
};

/**
 * The header's mark that the browser is offline.
 */
export function OfflineBadge() {
    return (
        <span className="k-offline" role="status">
            <WifiOff {...ICON} />
            Offline
        </span>
    );
}

/**
 * Not saved, in place of Save draft once a save failed, with why beside it:
 * Retry now sends the changes again, and Keep editing closes the note. It
 * opens on its own when a save fails, without taking focus from the field.
 */
export function SaveFailedNotice({
    problem,
    offline,
    saving,
    open,
    onOpenChange,
    onRetry,
}: {
    problem: SaveProblem;
    offline: boolean;
    saving: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onRetry: () => void;
}) {
    const detail = offline
        ? 'You are offline. Your changes stay on this screen, and saving starts again on its own when you are back online.'
        : problem.unreachable
          ? `${problem.detail} Your changes stay on this screen, and saving tries again on its own.`
          : `${problem.detail} Your changes stay on this screen.`;
    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger className="k-button k-button--secondary k-button--small k-save-failed__trigger">
                {saving ? <LoaderCircle {...ICON} className="k-spin" /> : <CircleAlert {...ICON} />}
                {saving ? 'Saving' : 'Not saved'}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={8} align="end" className="k-positioner">
                    <Popover.Popup className="k-popup k-save-failed" initialFocus={(openType) => openType !== ''}>
                        <div role="alert">
                            <Popover.Title className="k-save-failed__title">
                                <CircleAlert {...ICON} />
                                {saving ? 'Trying again' : 'Couldn’t save your changes'}
                            </Popover.Title>
                            <Popover.Description className="k-save-failed__detail">{detail}</Popover.Description>
                        </div>
                        <div className="k-save-failed__actions">
                            <button type="button" className="k-button k-button--primary k-button--small" disabled={saving} onClick={onRetry}>
                                {saving ? 'Retrying' : 'Retry now'}
                            </button>
                            <Popover.Close className="k-button k-button--secondary k-button--small">Keep editing</Popover.Close>
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
