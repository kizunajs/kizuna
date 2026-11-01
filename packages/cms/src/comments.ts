import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import { dataFields } from './field.js';
import { DEFAULT_SITE, type Person } from './options.js';
import { formatRef, type DocumentRef } from './refs.js';
import type { EditorAccess } from './site-access.js';
import type { CommentRow, Content, DocumentRow } from './storage/store.js';
import { documentLabel, peopleFor, peopleOf, viewOf, type PersonView } from './reviews.js';

/**
 * A comment as the editor shows it: on one field of a document's draft,
 * maybe about a phrase of its text, maybe in a review.
 */
export interface CommentView {
    id: string;
    path: string;
    text: string;
    by: PersonView;
    /**
     * The agent that wrote it for `by`, like `Claude`, or `null` when they
     * wrote it themselves.
     */
    via: string | null;
    createdAt: string;
    resolvedBy: PersonView | null;
    resolvedAt: string | null;
    /**
     * The comment that starts the thread this one answers.
     */
    replyTo: string | null;
    /**
     * The review it was left in.
     */
    review: string | null;
    /**
     * The phrase it is about, and whether the field's text still holds it.
     */
    anchor: {
        text: string;
        changed: boolean;
    } | null;
    mentions: PersonView[];
    assignee: PersonView | null;
}

/**
 * A field's value as text: a string as it is, rich text as its words, a
 * line per block. `undefined` for any other value.
 */
export const textOf = (value: unknown): string | undefined => {
    if (typeof value === 'string') return value;
    if (!Array.isArray(value)) return undefined;
    return value
        .map((block: { _type?: unknown; children?: unknown }) =>
            block._type === 'block' && Array.isArray(block.children)
                ? block.children.map((span: { text?: unknown }) => (typeof span.text === 'string' ? span.text : '')).join('')
                : ''
        )
        .join('\n');
};

const valueAt = (content: Content | null | undefined, path: string): unknown =>
    path
        .split('.')
        .reduce<unknown>(
            (value, key) => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined),
            content
        );

/**
 * What a document holds now: its draft, or what is live when it has none.
 */
const contentOf = (row: DocumentRow | undefined): Content | null => row?.draft ?? row?.published ?? null;

export const commentViewOf = (comment: CommentRow, people: readonly Person[], content: Content | null): CommentView => ({
    id: comment.id,
    path: comment.path,
    text: comment.text,
    by: viewOf(people, comment.createdBy),
    via: comment.via,
    createdAt: comment.createdAt.toISOString(),
    resolvedBy: comment.resolvedBy === null ? null : viewOf(people, comment.resolvedBy),
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    replyTo: comment.replyTo,
    review: comment.reviewId,
    anchor:
        comment.anchor === null
            ? null
            : {
                  text: comment.anchor,
                  changed: !(textOf(valueAt(content, comment.path)) ?? '').includes(comment.anchor),
              },
    mentions: comment.mentions.map((id) => viewOf(people, id)),
    assignee: comment.assignee === null ? null : viewOf(people, comment.assignee),
});

/**
 * The comments on a document's draft, oldest first: every one left on the
 * draft itself, and those left in its reviews since it was last published.
 */
export const commentsOf = async (cms: CmsService, state: DraftState, people?: readonly Person[]): Promise<CommentView[]> => {
    const row = state.row;
    if (row === undefined) return [];
    const reviews = new Set(
        (await cms.store.reviewsOf(row.id))
            .filter((review) => row.publishedAt === null || review.createdAt > row.publishedAt)
            .map((review) => review.id)
    );
    const listed = people ?? (await peopleOf(cms));
    return (await cms.store.documentComments(row.id))
        .filter((comment) => comment.reviewId === null || reviews.has(comment.reviewId))
        .map((comment) => commentViewOf(comment, listed, contentOf(row)));
};

/**
 * What a new comment says, and where it goes.
 */
export interface NewComment {
    ref: DocumentRef;
    /**
     * The field, as a change to it is keyed. An answer takes its thread's.
     */
    path?: string | undefined;
    text: string;
    anchor?: string | undefined;
    mentions?: readonly string[] | undefined;
    assignee?: string | null | undefined;
    replyTo?: string | undefined;
    review?: string | undefined;
    by: string;
    via: string | null;
    /**
     * Who may be mentioned or named, as the people who open the document.
     * Left out, anyone in the people list.
     */
    access?: EditorAccess | undefined;
}

/**
 * Leaves a comment on one field of a document's draft: about a phrase of
 * its text, answering a thread, mentioning people who open the document,
 * and naming one of them to deal with it.
 */
export const addComment = async (cms: CmsService, input: NewComment): Promise<CommentView> => {
    const state = await cms.draftState(input.ref);
    const label = formatRef(state.target.ref);
    if (state.row === undefined) {
        throw new CmsHttpError(409, {
            detail: `'${label}' has no content yet. Save a draft before commenting on it.`,
        });
    }
    let path = input.path;
    let anchor = input.anchor;
    if (input.replyTo !== undefined) {
        const answered = await cms.store.comment(input.replyTo);
        if (answered === undefined || answered.documentId !== state.row.id) {
            throw new CmsHttpError(404, {
                detail: `'${label}' has no comment '${input.replyTo}'.`,
            });
        }
        const thread = answered.replyTo === null ? answered : ((await cms.store.comment(answered.replyTo)) ?? answered);
        if (thread.resolvedAt !== null) {
            throw new CmsHttpError(409, {
                detail: 'That thread is resolved.',
            });
        }
        if (path !== undefined && path !== thread.path) {
            throw new CmsHttpError(422, {
                detail: `The thread is on '${thread.path}', so its answers are too.`,
            });
        }
        path = thread.path;
        anchor = thread.anchor ?? undefined;
        input = {
            ...input,
            replyTo: thread.id,
        };
    } else {
        if (path === undefined) {
            throw new CmsHttpError(422, {
                detail: 'Name the field to comment on, or the comment to answer.',
            });
        }
        const name = path.split('.')[0];
        if (!dataFields(state.target.definition.fields).some((field) => field.name === name)) {
            throw new CmsHttpError(422, {
                detail: `'${label}' has no field '${path}'. Describe the document to learn its fields.`,
            });
        }
        if (anchor !== undefined) {
            const text = textOf(valueAt(contentOf(state.row), path));
            if (text === undefined) {
                throw new CmsHttpError(422, {
                    detail: `'${path}' holds no text to quote. Comment on the field without a phrase.`,
                });
            }
            if (!text.includes(anchor)) {
                throw new CmsHttpError(422, {
                    detail: `'${path}' does not hold '${anchor}'. Quote the field's text as the draft has it.`,
                });
            }
        }
    }
    const mentions = [...new Set(input.mentions ?? [])];
    const assignee = input.assignee ?? null;
    const named = [...mentions, ...(assignee === null ? [] : [assignee])];
    if (named.length > 0) {
        const people = input.access === undefined ? await peopleOf(cms) : await peopleFor(cms, input.access, state.target.site);
        const outside = named.find((id) => !people.some((person) => person.id === id));
        if (outside !== undefined) {
            throw new CmsHttpError(422, {
                detail: `'${outside}' does not open '${label}'. Pick someone from the people list.`,
            });
        }
    }
    const row = await cms.store.addComment({
        documentId: state.row.id,
        reviewId: input.review ?? null,
        path,
        text: input.text,
        createdBy: input.by,
        createdAt: new Date(),
        replyTo: input.replyTo ?? null,
        anchor: anchor ?? null,
        mentions,
        assignee,
        via: input.via,
    });
    return commentViewOf(row, await peopleOf(cms), contentOf(state.row));
};

/**
 * Resolves a comment with every answer in its thread. Resolving one twice
 * changes nothing. An answer resolves the thread it is in.
 */
export const resolveThread = async (cms: CmsService, input: { id: string; by: string }): Promise<CommentView> => {
    const comment = await cms.store.comment(input.id);
    if (comment === undefined) {
        throw new CmsHttpError(404, {
            detail: `No comment '${input.id}'.`,
        });
    }
    const thread = comment.replyTo ?? comment.id;
    await cms.store.resolveComment(thread, input.by);
    const resolved = (await cms.store.comment(thread))!;
    const row = await cms.store.getById(resolved.documentId);
    return commentViewOf(resolved, await peopleOf(cms), contentOf(row));
};

/**
 * The document a stored row holds, by its ref.
 */
export const refOfRow = (cms: CmsService, row: DocumentRow): DocumentRef | undefined => {
    const site =
        row.site === DEFAULT_SITE
            ? {}
            : {
                  site: row.site,
              };
    const locale =
        row.locale === 'default'
            ? {}
            : {
                  locale: row.locale,
              };
    if (row.kind === 'page' || row.kind === 'global') {
        return {
            type: row.kind,
            name: row.key,
            ...site,
            ...locale,
        };
    }
    if (row.kind !== 'item') return undefined;
    const listings = cms.listings().filter((listing) => row.key.startsWith(listing.keyPrefix));
    // A site's values on a shared item are stored under the shared collection's prefix.
    const listing =
        listings.find((candidate) => candidate.site === row.site) ?? listings.find((candidate) => candidate.site === DEFAULT_SITE);
    if (listing === undefined) return undefined;
    return {
        ...listing.refOf(row.key.slice(listing.keyPrefix.length)),
        ...site,
        ...locale,
    };
};

/**
 * A thread that waits on someone, as Waiting lists it: the comment that
 * mentions them or names them, with the document it is on.
 */
export type WaitingComment = CommentView & {
    reason: 'mentioned' | 'assigned';
    ref: string;
    label: string;
};

/**
 * The open threads that wait on someone: those naming them as the
 * assignee, and those where someone else mentions them. Each thread is
 * listed once, assigned before mentioned, until it is resolved.
 */
export const waitingComments = async (cms: CmsService, person: string, sees: (ref: string) => boolean): Promise<WaitingComment[]> => {
    const open = await cms.store.openComments();
    const people = await peopleOf(cms);
    const threads = new Map<string, { thread: CommentRow; answers: CommentRow[] }>();
    for (const comment of open) {
        if (comment.replyTo === null) {
            threads.set(comment.id, {
                thread: comment,
                answers: threads.get(comment.id)?.answers ?? [],
            });
        }
    }
    for (const comment of open) {
        if (comment.replyTo !== null) threads.get(comment.replyTo)?.answers.push(comment);
    }
    const waiting: WaitingComment[] = [];
    const documents = new Map<string, { ref: string; state: DraftState } | null>();
    for (const { thread, answers } of threads.values()) {
        const mention = [thread, ...answers].filter((comment) => comment.createdBy !== person && comment.mentions.includes(person)).at(-1);
        const reason = thread.assignee === person ? 'assigned' : mention === undefined ? undefined : 'mentioned';
        if (reason === undefined) continue;
        if (!documents.has(thread.documentId)) {
            const row = await cms.store.getById(thread.documentId);
            const ref = row === undefined ? undefined : refOfRow(cms, row);
            const state = ref === undefined ? undefined : await cms.draftState(ref).catch(() => undefined);
            documents.set(
                thread.documentId,
                state === undefined || !sees(formatRef(state.target.ref))
                    ? null
                    : {
                          ref: formatRef(state.target.ref),
                          state,
                      }
            );
        }
        const document = documents.get(thread.documentId);
        if (document === null || document === undefined) continue;
        const shown = reason === 'assigned' ? thread : mention!;
        waiting.push({
            ...commentViewOf(shown, people, contentOf(document.state.row)),
            reason,
            ref: document.ref,
            label: documentLabel(document.state),
        });
    }
    return waiting;
};
