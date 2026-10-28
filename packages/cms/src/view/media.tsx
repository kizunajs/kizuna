import { useEffect, useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ImageIcon } from 'lucide-react';
import type { Connection } from './connection.js';
import { ICON, useEditorContext } from './context.js';

export interface MediaRecord {
    id: string;
    url: string;
    filename: string;
    width: number;
    height: number;
    alt?: string;
}

/**
 * Every uploaded image, to pick one from.
 */
export function MediaPicker({
    current,
    onPick,
    disabled,
    label,
}: {
    current: string | undefined;
    onPick: (record: MediaRecord) => void;
    disabled: boolean;
    /**
     * What the button says, when "Choose image" or "Replace" does not fit.
     */
    label?: string;
}) {
    const { connection, resolveUrl } = useEditorContext();
    const [open, setOpen] = useState(false);
    const [media, setMedia] = useState<MediaRecord[] | undefined>();
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        if (!open) return;
        void connection.call<{ media: MediaRecord[] }>('editing_media_list').then((answer) => {
            setMedia(answer.status === 200 ? answer.body.media : []);
            setFailed(answer.status !== 200);
        });
    }, [open, connection]);
    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger className="k-button k-button--secondary k-button--small" disabled={disabled}>
                <ImageIcon {...ICON} />
                {label ?? (current === undefined ? 'Choose image' : 'Replace')}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner sideOffset={6} align="start" className="k-positioner">
                    <Popover.Popup className="k-popup k-media">
                        {media === undefined ? <p className="k-help">Loading</p> : null}
                        {failed ? <p className="k-help">The images could not be listed. Close this and try again.</p> : null}
                        {media?.length === 0 && !failed ? <p className="k-help">Nothing uploaded yet</p> : null}
                        <div className="k-media__grid">
                            {media?.map((record) => (
                                <button
                                    key={record.id}
                                    type="button"
                                    className="k-media__tile"
                                    aria-pressed={record.id === current}
                                    title={record.filename}
                                    onClick={() => {
                                        onPick(record);
                                        setOpen(false);
                                    }}>
                                    <img src={resolveUrl(`${record.url}?w=240`)} alt={record.alt ?? ''} />
                                </button>
                            ))}
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

/**
 * Uploads one file: the CMS hands back where to send it, the browser sends it
 * there, and the CMS checks it and adds it to the library.
 */
export const uploadMedia = async (connection: Connection, file: File): Promise<MediaRecord | { problem: string }> => {
    const started = await connection.call<{ uploadId: string; url: string; headers: Record<string, string>; maxBytes: number }>(
        'editing_media_create_upload',
        {
            body: {
                filename: file.name,
                contentType: file.type === '' ? 'application/octet-stream' : file.type,
                size: file.size,
            },
        }
    );
    if (started.status !== 201) {
        return {
            problem: (started.body as { detail?: string } | undefined)?.detail ?? 'The upload could not start.',
        };
    }
    if (file.size > started.body.maxBytes) {
        return {
            problem: `The file is larger than ${Math.floor(started.body.maxBytes / 1_000_000)} MB.`,
        };
    }
    const sent = await fetch(started.body.url, {
        method: 'PUT',
        headers: started.body.headers,
        body: file,
    }).catch(() => undefined);
    if (sent === undefined || !sent.ok) {
        return {
            problem: 'The file did not upload.',
        };
    }
    const finished = await connection.call<MediaRecord>('editing_media_complete_upload', {
        params: {
            uploadId: started.body.uploadId,
        },
    });
    if (finished.status !== 201) {
        return {
            problem: (finished.body as { detail?: string } | undefined)?.detail ?? 'The file was not accepted.',
        };
    }
    return finished.body;
};
