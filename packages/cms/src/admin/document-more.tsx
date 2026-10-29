import { Fragment, useImperativeHandle, useState, type Ref } from 'react';
import { Menu } from '@base-ui/react/menu';
import { Toast } from '@base-ui/react/toast';
import { Copy, EyeOff, MessageCircle, Play, Trash2 } from 'lucide-react';
import { toolsFor, type Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import type { Description } from '../view/schema.js';
import { parseRef } from '../refs.js';
import { itemActionCall, outcomeOf } from './actions.js';
import { ConfirmDialog, type Confirmation } from './confirm.js';
import { duplicateValuesOf, menuEntriesOf, type MenuEntry } from './document-menu.js';
import { hrefOf } from './navigation.js';
import { problemOf } from './parts.js';
import { useOfferUndo } from './toasts.js';

const ICONS = {
    ask: MessageCircle,
    unpublish: EyeOff,
    duplicate: Copy,
    delete: Trash2,
    action: Play,
};

/**
 * What an entry asks before it runs, when it asks anything.
 */
const confirmationOf = (entry: MenuEntry, title: string): Confirmation | undefined => {
    if (entry.kind === 'unpublish') {
        return {
            label: 'Unpublish',
            question: `Unpublish ${title}? Visitors stop seeing it, and the draft stays.`,
        };
    }
    if (entry.kind === 'delete') {
        return {
            label: 'Delete',
            question: `Delete ${title}, with its history? Pages that show it stop showing it.`,
        };
    }
    if (entry.kind === 'action' && entry.action.confirm !== undefined) {
        return {
            label: entry.label,
            question: entry.action.confirm,
        };
    }
    return undefined;
};

export interface DocumentMoreHandle {
    /**
     * Runs an entry as a click on it does, asking first where the menu asks.
     */
    choose: (entry: MenuEntry) => void;
}

/**
 * The `…` menu beside Publish: Ask for review, Unpublish, Duplicate, the
 * collection's actions and Delete, each asking first where it cannot be
 * taken back.
 */
export function DocumentMore({
    connection,
    document,
    title,
    askable,
    onAsk,
    onChanged,
    onProblem,
    ref,
}: {
    connection: Connection;
    document: Description;
    title: string;
    askable: boolean;
    onAsk: () => void;
    /**
     * Called after an entry changes the document, so the screen reloads it.
     */
    onChanged: () => void;
    onProblem: (problem: string | undefined) => void;
    ref?: Ref<DocumentMoreHandle>;
}) {
    const [confirming, setConfirming] = useState<{ entry: MenuEntry; question: Confirmation } | undefined>();
    const toasts = Toast.useToastManager();
    const offerUndo = useOfferUndo();
    const entries = menuEntriesOf({
        kind: document.kind,
        status: document.status,
        askable,
        actions: document.actions,
    });

    const run = async (entry: MenuEntry): Promise<void> => {
        setConfirming(undefined);
        onProblem(undefined);
        const tools = toolsFor(document.ref);
        const item = parseRef(document.ref);
        if (entry.kind === 'ask') {
            onAsk();
            return;
        }
        if (entry.kind === 'unpublish' && tools !== undefined) {
            // Publishing again brings back what was live only when the draft held nothing more, and no review stands in its way.
            const republishes =
                document.status === 'published' && (!document.requireReview || document.review?.status === 'approved');
            const answer = await connection.call(`${tools.prefix}_unpublish`, {
                params: tools.params,
            });
            if (answer.status !== 200) {
                onProblem(problemOf(answer, 'It was not unpublished'));
                return;
            }
            const message = `Unpublished ${title}.`;
            if (republishes) {
                offerUndo(message, () => {
                    // The person pressed Undo, so the route runs without asking again.
                    void connection
                        .call(
                            `${tools.prefix}_publish`,
                            {
                                params: tools.params,
                                body: {},
                            },
                            {
                                approved: true,
                            }
                        )
                        .then((again) => {
                            if (again.status !== 200) onProblem(problemOf(again, 'It was not published again'));
                            onChanged();
                        });
                });
            } else {
                toasts.add({
                    description: message,
                });
            }
            onChanged();
            return;
        }
        if (item?.type !== 'item') return;
        if (entry.kind === 'duplicate') {
            const answer = await connection.call<{ ref: string }>('editing_collections_create_item', {
                params: {
                    name: item.collection,
                },
                body: {
                    values: duplicateValuesOf(document.fields, document.draft),
                },
            });
            if (answer.status !== 201) {
                onProblem(problemOf(answer, 'It was not duplicated'));
                return;
            }
            window.location.hash = hrefOf({
                kind: 'document',
                ref: answer.body.ref,
            });
            return;
        }
        if (entry.kind === 'delete') {
            const answer = await connection.call('editing_collections_delete_item', {
                params: {
                    name: item.collection,
                    id: item.id,
                },
            });
            if (answer.status >= 300) {
                onProblem(problemOf(answer, 'It was not deleted'));
                return;
            }
            toasts.add({
                description: `Deleted ${title}.`,
            });
            window.location.hash = hrefOf({
                kind: 'collection',
                name: item.collection,
            });
            return;
        }
        if (entry.kind === 'action') {
            const call = itemActionCall(document.ref, entry.action.name);
            if (call === undefined) return;
            const answer = await connection.call(call.name, call.input);
            const outcome = outcomeOf(answer, entry.label);
            if (outcome.problem) {
                onProblem(outcome.message);
                return;
            }
            toasts.add({
                description: outcome.message,
            });
            onChanged();
        }
    };

    const choose = (entry: MenuEntry): void => {
        const question = confirmationOf(entry, title);
        if (question === undefined) void run(entry);
        else
            setConfirming({
                entry,
                question,
            });
    };

    useImperativeHandle(ref, () => ({
        choose,
    }));

    if (entries.length === 0) return null;

    return (
        <>
            <Menu.Root>
                <Menu.Trigger className="k-button k-button--secondary k-button--small k-button--icon" aria-label="More actions">
                    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                        <circle cx="19" cy="12" r="1.6" fill="currentColor" />
                    </svg>
                </Menu.Trigger>
                <Menu.Portal>
                    <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                        <Menu.Popup className="k-popup k-menu k-document-menu">
                            {entries.map((entry) => {
                                const Icon = ICONS[entry.kind];
                                return (
                                    <Fragment key={entry.kind === 'action' ? `action:${entry.action.name}` : entry.kind}>
                                        {entry.kind === 'delete' && entries.length > 1 ? (
                                            <Menu.Separator className="k-menu__separator" />
                                        ) : null}
                                        <Menu.Item className="k-menu__item" onClick={() => choose(entry)}>
                                            <Icon {...ICON} className="k-menu__icon" />
                                            {entry.label}
                                        </Menu.Item>
                                    </Fragment>
                                );
                            })}
                        </Menu.Popup>
                    </Menu.Positioner>
                </Menu.Portal>
            </Menu.Root>
            <ConfirmDialog
                confirming={confirming?.question}
                onConfirm={() => {
                    if (confirming !== undefined) void run(confirming.entry);
                }}
                onCancel={() => setConfirming(undefined)}
            />
        </>
    );
}
