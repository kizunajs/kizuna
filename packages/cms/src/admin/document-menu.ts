import { labelOf, valueAt, type DescribedField, type DocumentStatus } from '../view/schema.js';
import { shownActions, type AvailableAction } from './actions.js';
import type { VersionSummary } from './history.js';

/**
 * One entry of the `…` menu beside Publish.
 */
export type MenuEntry =
    | {
          kind: 'ask' | 'withdraw' | 'cancelSchedule' | 'addToRelease' | 'unpublish' | 'duplicate' | 'delete';
          label: string;
      }
    | {
          kind: 'action';
          label: string;
          action: AvailableAction;
      };

/**
 * What the `…` menu offers a document: asking for a review when someone else
 * edits, or withdrawing the request while it waits, taking back its schedule
 * or adding its draft to a release, unpublishing what is
 * live, duplicating an item, the collection's own actions, and deleting the
 * item last.
 */
export const menuEntriesOf = (input: {
    kind: 'page' | 'global' | 'item';
    status: DocumentStatus;
    /**
     * Whether someone besides the person edits, so a review has someone to ask.
     */
    askable: boolean;
    /**
     * Whether the person asked for a review that still waits, so they may
     * take it back.
     */
    withdrawable?: boolean;
    /**
     * Whether the document is scheduled on its own or with a release, which
     * the menu offers to take back.
     */
    scheduled?: 'own' | 'release';
    actions: readonly AvailableAction[] | undefined;
}): MenuEntry[] => {
    const entries: MenuEntry[] = [];
    if (input.withdrawable === true) {
        entries.push({
            kind: 'withdraw',
            label: 'Withdraw request',
        });
    } else if (input.askable) {
        entries.push({
            kind: 'ask',
            label: 'Ask for review',
        });
    }
    if (input.scheduled !== undefined) {
        entries.push({
            kind: 'cancelSchedule',
            label: input.scheduled === 'release' ? 'Take out of release' : 'Cancel schedule',
        });
    } else if (input.status === 'draft' || input.status === 'changed') {
        entries.push({
            kind: 'addToRelease',
            label: 'Add to release',
        });
    }
    if (input.status === 'published' || input.status === 'changed') {
        entries.push({
            kind: 'unpublish',
            label: 'Unpublish',
        });
    }
    if (input.kind === 'item') {
        entries.push({
            kind: 'duplicate',
            label: 'Duplicate',
        });
    }
    for (const action of shownActions(input.actions)) {
        entries.push({
            kind: 'action',
            label: action.label,
            action,
        });
    }
    if (input.kind === 'item') {
        entries.push({
            kind: 'delete',
            label: 'Delete',
        });
    }
    return entries;
};

/**
 * The values a duplicate starts with: every top-level field the person may
 * write, as the draft holds it.
 */
export const duplicateValuesOf = (fields: readonly DescribedField[], draft: Record<string, unknown> | null): Record<string, unknown> =>
    Object.fromEntries(
        fields
            .filter((field) => field.parent === undefined && field.writable && !field.readOnly)
            .map((field) => [field.path, valueAt(draft, field.path)])
            .filter(([, value]) => value !== undefined)
    );

/**
 * What stops Publish, named by the fields' labels: "Fill in Department
 * before publishing".
 */
export const blockerOf = (missing: readonly string[], fields: readonly DescribedField[]): string | undefined => {
    if (missing.length === 0) return undefined;
    const labels = missing.map((name) => {
        const field = fields.find((candidate) => candidate.parent === undefined && candidate.name === name);
        return field === undefined ? name : labelOf(field);
    });
    const named = labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)!}`;
    return `Fill in ${named} before publishing`;
};

/**
 * Whether Publish has anything to do: a draft that differs from what is live,
 * or a review waiting for the person on another document.
 */
export const hasSomethingToPublish = (status: DocumentStatus, waitingElsewhere: number): boolean =>
    status === 'draft' || status === 'changed' || waitingElsewhere > 0;

/**
 * When a document was first saved and last published, from its versions,
 * newest first. `null` for one it has not reached yet.
 */
export const documentDatesOf = (versions: readonly VersionSummary[]): { created: string | null; published: string | null } => ({
    created: versions.at(-1)?.createdAt ?? null,
    published: versions.find((version) => version.published)?.createdAt ?? null,
});
