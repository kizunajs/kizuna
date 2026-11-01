import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast } from '@base-ui/react/toast';
import { FileText } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import { humanize } from '../view/schema.js';
import { TRASH_DAYS } from '../trash-window.js';
import { ConfirmDialog, type Confirmation } from './confirm.js';
import { PageHeader } from './page-header.js';
import { problemOf } from './parts.js';
import { relativeTimeOf } from './time.js';
import { emptyQuestionOf, eraseCallOf, eraseQuestionOf, restoreCallOf, type TrashItem } from './trash.js';

/**
 * What a Trash screen asks before it runs: deleting one item forever, or
 * everything in it.
 */
type Pending =
    | {
          kind: 'erase';
          item: TrashItem;
      }
    | {
          kind: 'empty';
      };

/**
 * The items of a site's own collections in the trash, or of the shared ones,
 * newest first, each with Restore and Delete forever.
 */
export function TrashScreen({
    connection,
    collectionLabel,
}: {
    /**
     * A connection that reaches the site's own collections in a site's place.
     */
    connection: Connection;
    collectionLabel: (name: string) => string | undefined;
}) {
    const toasts = Toast.useToastManager();
    const [items, setItems] = useState<TrashItem[] | undefined>();
    const [pending, setPending] = useState<Pending | undefined>();
    const now = useMemo(() => new Date(), [items]);

    const load = useCallback(async (): Promise<void> => {
        const answer = await connection.call<{ items: TrashItem[] }>('editing_collections_list_trash', {});
        setItems(answer.status === 200 ? answer.body.items : []);
    }, [connection]);

    useEffect(() => {
        void load();
    }, [load]);

    const restore = async (item: TrashItem): Promise<void> => {
        const call = restoreCallOf(item.ref);
        if (call === undefined) return;
        const answer = await connection.call(call.name, call.input);
        toasts.add({
            description: answer.status < 300 ? `Restored ${item.label}.` : problemOf(answer, 'It was not restored'),
        });
        await load();
    };

    const run = async (chosen: Pending): Promise<void> => {
        setPending(undefined);
        if (chosen.kind === 'empty') {
            const answer = await connection.call('editing_collections_empty_trash', {});
            toasts.add({
                description: answer.status < 300 ? 'Emptied the trash.' : problemOf(answer, 'The trash was not emptied'),
            });
            await load();
            return;
        }
        const call = eraseCallOf(chosen.item.ref);
        if (call === undefined) return;
        const answer = await connection.call(call.name, call.input);
        toasts.add({
            description: answer.status < 300 ? `Deleted ${chosen.item.label} forever.` : problemOf(answer, 'It was not deleted'),
        });
        await load();
    };

    const confirming: Confirmation | undefined =
        pending === undefined
            ? undefined
            : pending.kind === 'empty'
              ? {
                    label: 'Empty trash',
                    question: emptyQuestionOf(items?.length ?? 0),
                }
              : {
                    label: 'Delete forever',
                    question: eraseQuestionOf(pending.item),
                };

    return (
        <>
            <PageHeader
                title="Trash"
                meta={
                    items === undefined
                        ? undefined
                        : [
                              {
                                  label: 'Items',
                                  value: items.length,
                              },
                              {
                                  label: 'Kept for',
                                  value: `${TRASH_DAYS} days`,
                              },
                          ]
                }
                actions={
                    items === undefined || items.length === 0 ? undefined : (
                        <button
                            type="button"
                            className="k-button k-button--secondary k-button--small"
                            onClick={() =>
                                setPending({
                                    kind: 'empty',
                                })
                            }>
                            Empty trash
                        </button>
                    )
                }
            />
            <div className="k-admin__body k-trash">
                {items === undefined ? null : items.length === 0 ? (
                    <div className="k-list-results__empty">
                        <h2 className="k-list-results__empty-title">The trash is empty</h2>
                    </div>
                ) : (
                    <div className="k-trash__rows">
                        {items.map((item) => (
                            <div key={item.ref} className="k-trash__row">
                                <FileText {...ICON} className="k-trash__icon" />
                                <span className="k-trash__title">
                                    <span className="k-ellipsis">{item.label}</span>
                                    <span className="k-trash__detail k-ellipsis">
                                        {[
                                            collectionLabel(item.collection) ?? humanize(item.collection),
                                            item.under === 0 ? null : `${item.under} under it`,
                                        ]
                                            .filter((part) => part !== null)
                                            .join(' · ')}
                                    </span>
                                </span>
                                <span className="k-trash__by">
                                    <Avatar person={item.deletedBy} size={20} />
                                    <span className="k-ellipsis">{item.deletedBy.name}</span>
                                </span>
                                <span className="k-trash__when">
                                    <time dateTime={item.deletedAt}>{relativeTimeOf(item.deletedAt, now)}</time>
                                </span>
                                <span className="k-trash__actions">
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary k-button--small"
                                        onClick={() => void restore(item)}>
                                        Restore
                                    </button>
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary k-button--small"
                                        onClick={() =>
                                            setPending({
                                                kind: 'erase',
                                                item,
                                            })
                                        }>
                                        Delete forever
                                    </button>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <ConfirmDialog
                confirming={confirming}
                onConfirm={() => {
                    if (pending !== undefined) void run(pending);
                }}
                onCancel={() => setPending(undefined)}
            />
        </>
    );
}
