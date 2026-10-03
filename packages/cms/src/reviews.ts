import { randomUUID } from 'node:crypto';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import type { Person } from './options.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import type { ReviewRow } from './storage/store.js';

/**
 * Someone as the editor shows them: their name and picture.
 */
export interface PersonView {
    id: string;
    name: string;
    image?: string;
}

/**
 * Where a document's latest review stands. `outdated` is an approval of a
 * draft that changed after it.
 */
export interface ReviewState {
    id: string;
    status: 'open' | 'approved' | 'changes' | 'outdated';
    version: number;
    reviewers: PersonView[];
    requestedBy: PersonView;
    note: string | null;
    createdAt: string;
    decidedBy: PersonView | null;
    decisionNote: string | null;
    decidedAt: string | null;
}

const words = (name: string): string =>
    name
        .replace(/Page$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

/**
 * What editors call a document: its label, an item's title, or its name
 * written out.
 */
export const documentLabel = (state: DraftState): string => {
    const { ref, definition } = state.target;
    if (ref.type === 'item') {
        const content = state.row?.draft ?? state.row?.published ?? {};
        // The first text field, as the item list names items.
        const labelField = definition.fields.find((field) => readDef(unwrapOptionalWrappers(field.schema).inner).type === 'string')?.name;
        const label = labelField === undefined ? undefined : content[labelField];
        return typeof label === 'string' && label !== '' ? label : 'Untitled';
    }
    return definition.label ?? words(ref.name);
};

export const peopleOf = async (cms: CmsService): Promise<readonly Person[]> => (await cms.options.auth.people?.list()) ?? [];

const viewOf = (people: readonly Person[], id: string): PersonView => {
    const person = people.find((candidate) => candidate.id === id);
    if (person === undefined) {
        return {
            id,
            name: id,
        };
    }
    return {
        id: person.id,
        name: person.name,
        ...(person.image === undefined
            ? {}
            : {
                  image: person.image,
              }),
    };
};

const stateOf = (review: ReviewRow, version: number, people: readonly Person[]): ReviewState => ({
    id: review.id,
    status: review.status === 'approved' && review.version !== version ? 'outdated' : review.status,
    version: review.version,
    reviewers: review.reviewers.map((id) => viewOf(people, id)),
    requestedBy: viewOf(people, review.requestedBy),
    note: review.note,
    createdAt: review.createdAt.toISOString(),
    decidedBy: review.decidedBy === null ? null : viewOf(people, review.decidedBy),
    decisionNote: review.decisionNote,
    decidedAt: review.decidedAt?.toISOString() ?? null,
});

/**
 * The document's latest review, or `null` when nobody asked for one since it
 * was last published.
 */
export const reviewOf = async (cms: CmsService, state: DraftState, people?: readonly Person[]): Promise<ReviewState | null> => {
    // Once the draft is live there is nothing left to review.
    if (state.row === undefined || state.status === 'published' || state.status === 'empty') return null;
    const [latest] = await cms.store.reviewsOf(state.row.id);
    if (latest === undefined) return null;
    // A review from before the last publish was about a draft that is live now.
    if (state.row.publishedAt !== null && latest.createdAt <= state.row.publishedAt) return null;
    return stateOf(latest, state.version, people ?? (await peopleOf(cms)));
};

/**
 * Who changed the draft since it was last published.
 */
const authorsSincePublished = async (cms: CmsService, state: DraftState): Promise<Set<string>> => {
    if (state.row === undefined) return new Set();
    const published = state.row.publishedVersion ?? 0;
    const versions = await cms.store.versions(state.row.id);
    return new Set(versions.filter((version) => version.version > published).map((version) => version.createdBy));
};

const reviewRoles = (cms: CmsService): readonly string[] => {
    const roles = cms.options.reviews?.roles;
    return roles === undefined ? [] : typeof roles === 'string' ? [roles] : roles;
};

const hasRole = (role: string | readonly string[] | undefined, roles: readonly string[]): boolean =>
    role !== undefined && (typeof role === 'string' ? [role] : role).some((candidate) => roles.includes(candidate));

const refOrThrow = (value: string): DocumentRef => {
    const ref = parseRef(value);
    if (ref === undefined) throw new CmsHttpError(400, { detail: `'${value}' is not a document reference, like page:frontPage.` });
    return ref;
};

export const setOwner = async (cms: CmsService, ref: DocumentRef, owner: string | null): Promise<void> => {
    const state = await cms.draftState(ref);
    if (state.row === undefined) {
        throw new CmsHttpError(409, { detail: `'${formatRef(ref)}' has no content yet. Save a draft before naming its owner.` });
    }
    if (owner !== null) {
        const people = await peopleOf(cms);
        if (!people.some((person) => person.id === owner)) {
            throw new CmsHttpError(422, { detail: `Nobody called '${owner}' edits here. Pick someone from the people list.` });
        }
    }
    await cms.store.setOwner(state.row.id, owner);
};

/**
 * Asks people to review the drafts of one or more documents, and tells them
 * through `onReviewRequested`.
 */
export const requestReviews = async (
    cms: CmsService,
    input: { refs: readonly string[]; reviewers: readonly string[]; note: string | null; by: string }
): Promise<ReviewState[]> => {
    const people = await peopleOf(cms);
    const reviewers = [...new Set(input.reviewers)];
    for (const reviewer of reviewers) {
        if (!people.some((person) => person.id === reviewer)) {
            throw new CmsHttpError(422, { detail: `Nobody called '${reviewer}' edits here. Pick reviewers from the people list.` });
        }
    }
    if (reviewers.length === 0) throw new CmsHttpError(422, { detail: 'Name at least one reviewer.' });
    const states: DraftState[] = [];
    for (const value of new Set(input.refs)) {
        const state = await cms.draftState(refOrThrow(value));
        if (state.row === undefined || (state.status !== 'draft' && state.status !== 'changed')) {
            throw new CmsHttpError(409, { detail: `'${value}' has no unpublished changes to review.` });
        }
        states.push(state);
    }
    const requestId = randomUUID();
    // Newest first is how a document's current review is found, so a new request never shares the last one's time.
    let now = new Date();
    for (const state of states) {
        const [latest] = await cms.store.reviewsOf(state.row!.id);
        if (latest !== undefined && latest.createdAt.getTime() >= now.getTime()) now = new Date(latest.createdAt.getTime() + 1);
    }
    const rows = await cms.store.addReviews(
        states.map((state) => ({
            requestId,
            ref: formatRef(state.target.ref),
            documentId: state.row!.id,
            version: state.version,
            reviewers,
            requestedBy: input.by,
            note: input.note,
            createdAt: now,
        }))
    );
    const notify = cms.options.reviews?.onReviewRequested;
    if (notify !== undefined) {
        const person = (id: string): Person => people.find((candidate) => candidate.id === id) ?? { id, name: id };
        try {
            await notify({
                documents: states.map((state) => ({
                    ref: formatRef(state.target.ref),
                    label: documentLabel(state),
                    path: cms.addressOf(state.target, state.row?.draft ?? state.row?.published) ?? null,
                })),
                reviewers: reviewers.map(person),
                requestedBy: person(input.by),
                note: input.note,
            });
        } catch (error) {
            console.warn(`[kizuna-cms] onReviewRequested failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    return rows.map((row, index) => stateOf(row, states[index]!.version, people));
};

/**
 * Approves reviews, or sends them back with changes to make. A reviewer who
 * was asked may answer, and so may anyone with a role under `reviews.roles`.
 * Nobody approves changes they made themselves.
 */
export const decideReviews = async (
    cms: CmsService,
    input: {
        ids: readonly string[];
        decision: 'approve' | 'requestChanges';
        note: string | null;
        by: string;
        role: string | readonly string[] | undefined;
    }
): Promise<ReviewState[]> => {
    const people = await peopleOf(cms);
    const reviews = await cms.store.reviews(input.ids);
    const decided: ReviewState[] = [];
    for (const id of new Set(input.ids)) {
        const review = reviews.find((candidate) => candidate.id === id);
        if (review === undefined) throw new CmsHttpError(404, { detail: `No review '${id}'.` });
        if (review.status !== 'open') throw new CmsHttpError(409, { detail: `The review of '${review.ref}' was already answered.` });
        if (!review.reviewers.includes(input.by) && !hasRole(input.role, reviewRoles(cms))) {
            throw new CmsHttpError(403, { detail: `You were not asked to review '${review.ref}'.` });
        }
        const state = await cms.draftState(refOrThrow(review.ref));
        if (input.decision === 'approve' && (await authorsSincePublished(cms, state)).has(input.by)) {
            throw new CmsHttpError(403, { detail: `You changed '${review.ref}' yourself, so someone else approves it.` });
        }
        const status = input.decision === 'approve' ? 'approved' : 'changes';
        await cms.store.decideReview(id, {
            status,
            by: input.by,
            note: input.note,
            version: state.version,
        });
        decided.push(
            stateOf(
                {
                    ...review,
                    status,
                    decidedBy: input.by,
                    decisionNote: input.note,
                    decidedAt: new Date(),
                    version: state.version,
                },
                state.version,
                people
            )
        );
    }
    return decided;
};

/**
 * Reviews still waiting for an answer, the latest per document, for one
 * reviewer or for anyone.
 */
export const waitingReviews = async (
    cms: CmsService,
    reviewer: string | undefined
): Promise<Array<ReviewState & { ref: string; label: string; path: string | null }>> => {
    const people = await peopleOf(cms);
    const open = await cms.store.openReviews();
    const latest = new Map<string, ReviewRow>();
    for (const review of open) latest.set(review.documentId, review);
    const waiting = [];
    for (const review of latest.values()) {
        if (reviewer !== undefined && !review.reviewers.includes(reviewer)) continue;
        const ref = parseRef(review.ref);
        if (ref === undefined) continue;
        const state = await cms.draftState(ref).catch(() => undefined);
        if (state === undefined) continue;
        // A newer review of the same document replaced this one.
        const current = await reviewOf(cms, state, people);
        if (current?.id !== review.id) continue;
        waiting.push({
            ...current,
            ref: review.ref,
            label: documentLabel(state),
            path: cms.addressOf(state.target, state.row?.draft ?? state.row?.published) ?? null,
        });
    }
    return waiting;
};

/**
 * Refuses to publish a document whose definition requires a review, until
 * its current draft is approved.
 */
export const assertReviewed = async (cms: CmsService, state: DraftState): Promise<void> => {
    if (state.target.definition.requireReview !== true) return;
    const review = await reviewOf(cms, state);
    if (review?.status === 'approved') return;
    const label = documentLabel(state);
    const detail =
        review === null
            ? `${label} needs an approval before it goes live. Ask someone to review it.`
            : review.status === 'open'
              ? `${label} is waiting for ${review.reviewers.map((reviewer) => reviewer.name).join(' or ')} to approve it.`
              : review.status === 'changes'
                ? `${review.decidedBy?.name ?? 'The reviewer'} asked for changes to ${label}. Ask for a new review once they are made.`
                : `${label} changed after ${review.decidedBy?.name ?? 'the reviewer'} approved it. Ask for a new review.`;
    throw new CmsHttpError(409, {
        detail,
        review,
    });
};
