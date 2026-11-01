import { toolsFor } from '../view/connection.js';
import { TRASH_DAYS } from '../trash-window.js';
import type { AdminCall } from './actions.js';

/**
 * One item in the trash, as the trash route lists it.
 */
export interface TrashItem {
    ref: string;
    collection: string;
    id: string;
    label: string;
    deletedAt: string;
    deletedBy: {
        id: string;
        name: string;
        image?: string;
    };
    erasedAt: string;
    under: number;
    published: boolean;
}

/**
 * When a document went to the trash and who put it there, as a document's
 * address answers once it is there.
 */
export interface Trashed {
    at: string;
    by: string;
}

/**
 * The trash a `404` names, or `undefined` for a document that is gone.
 */
export const trashedOf = (body: unknown): Trashed | undefined => {
    const trashed = (body as { trashed?: unknown } | null)?.trashed as { at?: unknown; by?: unknown } | undefined;
    return typeof trashed?.at === 'string' && typeof trashed.by === 'string'
        ? {
              at: trashed.at,
              by: trashed.by,
          }
        : undefined;
};

const itemsOf = (count: number): string => (count === 1 ? '1 item' : `${count} items`);

/**
 * What Delete asks before it moves one document to the trash.
 */
export const deleteQuestionOf = (title: string): string =>
    `Delete ${title}? It goes to the trash for ${TRASH_DAYS} days, and pages that show it stop showing it.`;

/**
 * What an item in the trash is called with what went with it, like
 * "Lighting and the 2 items under it".
 */
const withBranch = (item: Pick<TrashItem, 'label' | 'under'>): string =>
    item.under === 0 ? item.label : `${item.label} and the ${itemsOf(item.under)} under it`;

/**
 * What Delete forever asks before it deletes an item in the trash.
 */
export const eraseQuestionOf = (item: Pick<TrashItem, 'label' | 'under'>): string =>
    `Delete ${withBranch(item)} forever? ${item.under === 0 ? 'Its' : 'Their'} history goes too.`;

/**
 * What Empty trash asks before it deletes everything in it.
 */
export const emptyQuestionOf = (count: number): string =>
    count === 1 ? 'Empty the trash? The item in it is deleted forever.' : `Empty the trash? The ${count} items in it are deleted forever.`;

/**
 * The call that restores an item in the trash, on its site when it is a
 * site's own.
 */
export const restoreCallOf = (ref: string): AdminCall | undefined => {
    const tools = toolsFor(ref);
    if (tools === undefined || !tools.prefix.endsWith('collections')) return undefined;
    return {
        name: `${tools.prefix}_restore_item`,
        input: {
            params: tools.params,
        },
    };
};

/**
 * The call that deletes an item in the trash for good.
 */
export const eraseCallOf = (ref: string): AdminCall | undefined => {
    const restore = restoreCallOf(ref);
    return restore === undefined
        ? undefined
        : {
              ...restore,
              name: restore.name.replace(/_restore_item$/, '_erase_item'),
          };
};
