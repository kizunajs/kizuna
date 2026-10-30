import { randomUUID } from 'node:crypto';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import { dataFields } from './field.js';
import { DEFAULT_SITE, type Person } from './options.js';
import type { EditorAccess } from './site-access.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import type { DocumentRow, ReviewCommentRow, ReviewRow } from './storage/store.js';

/**
 * Someone as the editor shows them: their name and picture.
 */
export interface PersonView {
    id: string;
    name: string;
    image?: string;
}

/**
 * A comment on one field of a review's draft.
 */
export interface ReviewComment {
    id: string;
    path: string;
    text: string;
    by: PersonView;
    createdAt: string;
    resolvedBy: PersonView | null;
    resolvedAt: string | null;
}

/**
 * Where a document's latest review stands. `outdated` is an approval of a
 * draft that changed after it.
 */
export interface ReviewState {
    id: string;
    status: 'open' | 'approved' | 'changes' | 'outdated' | 'withdrawn' | 'published-past-review';
    version: number;
    reviewers: PersonView[];
    requestedBy: PersonView;
    note: string | null;
    createdAt: string;
    decidedBy: PersonView | null;
    decisionNote: string | null;
    decidedAt: string | null;
    comments: ReviewComment[];
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
        const labelField = dataFields(definition.fields).find(
            (field) => readDef(unwrapOptionalWrappers(field.schema).inner).type === 'string'
        )?.name;
        const label = labelField === undefined ? undefined : content[labelField];
        return typeof label === 'string' && label !== '' ? label : 'Untitled';
    }
    return definition.label ?? words(ref.name);
};

export const peopleOf = async (cms: CmsService): Promise<readonly Person[]> => (await cms.options.auth.people?.list()) ?? [];

const holdsSite = (person: Person, site: string): boolean => {
    const role = person.sites?.[site];
    return role !== undefined && role.length > 0;
};

/**
 * Who an editor may name as an owner or a reviewer: on a site, the people
 * who hold it and the admins over every site; on shared content, the people
 * who share a site with them and those admins. Everyone, without
 * `auth.sites` or for an admin over every site.
 */
export const peopleFor = async (cms: CmsService, access: EditorAccess, site = DEFAULT_SITE): Promise<readonly Person[]> => {
    const everyone = await peopleOf(cms);
    if (cms.options.auth.sites === undefined) return everyone;
    const admin = (person: Person): boolean => person.roles?.includes('admin') === true;
    if (site !== DEFAULT_SITE) return everyone.filter((person) => admin(person) || holdsSite(person, site));
    if (access.publishesShared) return everyone;
    const held = Object.keys(access.sites);
    return everyone.filter((person) => admin(person) || held.some((name) => holdsSite(person, name)));
};

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

const commentViewOf = (comment: ReviewCommentRow, people: readonly Person[]): ReviewComment => ({
    id: comment.id,
    path: comment.path,
    text: comment.text,
    by: viewOf(people, comment.createdBy),
    createdAt: comment.createdAt.toISOString(),
    resolvedBy: comment.resolvedBy === null ? null : viewOf(people, comment.resolvedBy),
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
});

const stateOf = (review: ReviewRow, version: number, people: readonly Person[], comments: readonly ReviewCommentRow[]): ReviewState => ({
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
    comments: comments.map((comment) => commentViewOf(comment, people)),
});

/**
 * A document's reviews since it was last published, newest first.
 */
const reviewsSincePublished = async (cms: CmsService, row: DocumentRow): Promise<ReviewRow[]> => {
    const reviews = await cms.store.reviewsOf(row.id);
    // A review from before the last publish was about a draft that is live now.
    return row.publishedAt === null ? reviews : reviews.filter((review) => review.createdAt > row.publishedAt!);
};

/**
 * The comments on a document's draft: on every review since it was last
 * published, so asking again keeps them.
 */
const commentsOf = async (cms: CmsService, row: DocumentRow, reviews?: readonly ReviewRow[]): Promise<ReviewCommentRow[]> =>
    cms.store.reviewComments((reviews ?? (await reviewsSincePublished(cms, row))).map((review) => review.id));

/**
 * The document's latest review, or `null` when nobody asked for one since it
 * was last published or the person who asked took it back.
 */
export const reviewOf = async (cms: CmsService, state: DraftState, people?: readonly Person[]): Promise<ReviewState | null> => {
    // Once the draft is live there is nothing left to review.
    if (state.row === undefined || state.status === 'published' || state.status === 'empty') return null;
    const reviews = await reviewsSincePublished(cms, state.row);
    const [latest] = reviews;
    if (latest === undefined || latest.status === 'withdrawn' || latest.status === 'published-past-review') return null;
    return stateOf(latest, state.version, people ?? (await peopleOf(cms)), await commentsOf(cms, state.row, reviews));
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

/**
 * The role someone holds where a document is stored, by its ref.
 */
export type RoleOn = (ref: string) => string | readonly string[] | undefined;

const hasRole = (role: string | readonly string[] | undefined, roles: readonly string[]): boolean =>
    role !== undefined && (typeof role === 'string' ? [role] : role).some((candidate) => roles.includes(candidate));

const refOrThrow = (value: string): DocumentRef => {
    const ref = parseRef(value);
    if (ref === undefined) throw new CmsHttpError(400, { detail: `'${value}' is not a document reference, like page:frontPage.` });
    return ref;
};

export const setOwner = async (cms: CmsService, ref: DocumentRef, owner: string | null, access: EditorAccess): Promise<void> => {
    const state = await cms.draftState(ref);
    if (state.row === undefined) {
        throw new CmsHttpError(409, { detail: `'${formatRef(ref)}' has no content yet. Save a draft before naming its owner.` });
    }
    if (owner !== null) {
        const people = await peopleFor(cms, access, state.target.site);
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
    input: { refs: readonly string[]; reviewers: readonly string[]; note: string | null; by: string; access?: EditorAccess }
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
        if (input.access !== undefined) {
            const named = await peopleFor(cms, input.access, state.target.site);
            const outside = reviewers.find((reviewer) => !named.some((person) => person.id === reviewer));
            if (outside !== undefined) {
                throw new CmsHttpError(422, { detail: `'${outside}' does not edit '${value}'. Pick reviewers from the people list.` });
            }
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
    const requested: ReviewState[] = [];
    for (const [index, row] of rows.entries()) {
        const state = states[index]!;
        requested.push(stateOf(row, state.version, people, await commentsOf(cms, state.row!)));
    }
    return requested;
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
        roleOn: RoleOn;
    }
): Promise<ReviewState[]> => {
    const people = await peopleOf(cms);
    const reviews = await cms.store.reviews(input.ids);
    const decided: ReviewState[] = [];
    for (const id of new Set(input.ids)) {
        const review = reviews.find((candidate) => candidate.id === id);
        if (review === undefined) throw new CmsHttpError(404, { detail: `No review '${id}'.` });
        if (review.status !== 'open') throw new CmsHttpError(409, { detail: `The review of '${review.ref}' was already answered.` });
        if (!review.reviewers.includes(input.by) && !hasRole(input.roleOn(review.ref), reviewRoles(cms))) {
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
                people,
                await commentsOf(cms, state.row!)
            )
        );
    }
    return decided;
};

/**
 * A review with the document it is about, refused unless it is still that
 * document's current review: not taken back, and from after the last publish.
 */
const currentReview = async (cms: CmsService, review: ReviewRow): Promise<{ state: DraftState; current: ReviewState }> => {
    const state = await cms.draftState(refOrThrow(review.ref));
    const current = await reviewOf(cms, state);
    if (current?.id !== review.id) {
        throw new CmsHttpError(409, {
            detail:
                review.status === 'withdrawn'
                    ? `The review of '${review.ref}' was withdrawn.`
                    : `The review of '${review.ref}' is over: the draft was published or a newer review replaced it.`,
        });
    }
    return {
        state,
        current,
    };
};

/**
 * Takes back reviews the person asked for while they still wait for an
 * answer, so nobody is asked any more.
 */
export const withdrawReviews = async (cms: CmsService, input: { ids: readonly string[]; by: string }): Promise<ReviewState[]> => {
    const people = await peopleOf(cms);
    const reviews = await cms.store.reviews(input.ids);
    const withdrawn: ReviewState[] = [];
    for (const id of new Set(input.ids)) {
        const review = reviews.find((candidate) => candidate.id === id);
        if (review === undefined) throw new CmsHttpError(404, { detail: `No review '${id}'.` });
        if (review.requestedBy !== input.by) {
            throw new CmsHttpError(403, { detail: `Only the person who asked for the review of '${review.ref}' can withdraw it.` });
        }
        if (review.status !== 'open') throw new CmsHttpError(409, { detail: `The review of '${review.ref}' was already answered.` });
        const { state } = await currentReview(cms, review);
        await cms.store.decideReview(id, {
            status: 'withdrawn',
            by: input.by,
            note: null,
            version: review.version,
        });
        withdrawn.push(
            stateOf(
                {
                    ...review,
                    status: 'withdrawn',
                    decidedBy: input.by,
                    decidedAt: new Date(),
                },
                state.version,
                people,
                await commentsOf(cms, state.row!)
            )
        );
    }
    return withdrawn;
};

/**
 * Takes back the person's own approvals while the draft is unpublished, so
 * the reviews wait for an answer again.
 */
export const reopenReviews = async (cms: CmsService, input: { ids: readonly string[]; by: string }): Promise<ReviewState[]> => {
    const people = await peopleOf(cms);
    const reviews = await cms.store.reviews(input.ids);
    const reopened: ReviewState[] = [];
    for (const id of new Set(input.ids)) {
        const review = reviews.find((candidate) => candidate.id === id);
        if (review === undefined) throw new CmsHttpError(404, { detail: `No review '${id}'.` });
        if (review.status !== 'approved') throw new CmsHttpError(409, { detail: `The review of '${review.ref}' is not approved.` });
        if (review.decidedBy !== input.by) {
            throw new CmsHttpError(403, { detail: `Only the person who approved '${review.ref}' can undo the approval.` });
        }
        const { state } = await currentReview(cms, review);
        await cms.store.reopenReview(id);
        reopened.push(
            stateOf(
                {
                    ...review,
                    status: 'open',
                    decidedBy: null,
                    decisionNote: null,
                    decidedAt: null,
                },
                state.version,
                people,
                await commentsOf(cms, state.row!)
            )
        );
    }
    return reopened;
};

/**
 * Whether someone takes part in a review: they asked for it, were asked,
 * answered it, or hold a role under `reviews.roles`.
 */
const takesPart = (cms: CmsService, review: ReviewRow, by: string, roleOn: RoleOn): boolean =>
    review.requestedBy === by || review.reviewers.includes(by) || review.decidedBy === by || hasRole(roleOn(review.ref), reviewRoles(cms));

/**
 * Comments on one field of a review's draft, for the person who asked to see
 * under that field.
 */
export const commentOnReview = async (
    cms: CmsService,
    input: { review: string; path: string; text: string; by: string; roleOn: RoleOn }
): Promise<ReviewState> => {
    const [review] = await cms.store.reviews([input.review]);
    if (review === undefined) throw new CmsHttpError(404, { detail: `No review '${input.review}'.` });
    if (!takesPart(cms, review, input.by, input.roleOn)) {
        throw new CmsHttpError(403, { detail: `You were not asked to review '${review.ref}'.` });
    }
    const { state } = await currentReview(cms, review);
    const name = input.path.split('.')[0];
    if (!dataFields(state.target.definition.fields).some((field) => field.name === name)) {
        throw new CmsHttpError(422, { detail: `'${review.ref}' has no field '${input.path}'. Name a field from the changes list.` });
    }
    await cms.store.addReviewComment({
        reviewId: review.id,
        path: input.path,
        text: input.text,
        createdBy: input.by,
        createdAt: new Date(),
    });
    return (await reviewOf(cms, state))!;
};

/**
 * Marks a comment dealt with. Resolving one twice changes nothing.
 */
export const resolveComment = async (cms: CmsService, input: { id: string; by: string; roleOn: RoleOn }): Promise<ReviewState> => {
    const comment = await cms.store.reviewComment(input.id);
    if (comment === undefined) throw new CmsHttpError(404, { detail: `No comment '${input.id}'.` });
    const [review] = await cms.store.reviews([comment.reviewId]);
    if (review === undefined) throw new CmsHttpError(404, { detail: `No comment '${input.id}'.` });
    if (!takesPart(cms, review, input.by, input.roleOn)) {
        throw new CmsHttpError(403, { detail: `You were not asked to review '${review.ref}'.` });
    }
    const state = await cms.draftState(refOrThrow(review.ref));
    const current = await reviewOf(cms, state);
    if (current === null || !current.comments.some((candidate) => candidate.id === comment.id)) {
        throw new CmsHttpError(409, { detail: `The review of '${review.ref}' is over, so its comments are too.` });
    }
    if (comment.resolvedAt === null) await cms.store.resolveReviewComment(comment.id, input.by);
    return (await reviewOf(cms, state))!;
};

/**
 * How each version went live past its review, or was approved: the latest
 * such answer per version.
 */
export const versionReviewsOf = async (
    cms: CmsService,
    ref: DocumentRef
): Promise<Map<number, { status: 'approved' | 'published-past-review'; by: PersonView; at: string }>> => {
    const answered = new Map<number, { status: 'approved' | 'published-past-review'; by: PersonView; at: string }>();
    const state = await cms.draftState(ref);
    if (state.row === undefined) return answered;
    const people = await peopleOf(cms);
    for (const review of await cms.store.reviewsOf(state.row.id)) {
        if (review.status !== 'approved' && review.status !== 'published-past-review') continue;
        if (review.decidedBy === null || review.decidedAt === null || answered.has(review.version)) continue;
        answered.set(review.version, {
            status: review.status,
            by: viewOf(people, review.decidedBy),
            at: review.decidedAt.toISOString(),
        });
    }
    return answered;
};

/**
 * Reviews still waiting for an answer, the latest per document, for one
 * reviewer or for anyone.
 */
export const waitingReviews = async (
    cms: CmsService,
    reviewer: string | undefined,
    sees: (ref: string) => boolean = () => true
): Promise<Array<ReviewState & { ref: string; label: string; path: string | null }>> => {
    const people = await peopleOf(cms);
    const open = await cms.store.openReviews();
    const latest = new Map<string, ReviewRow>();
    for (const review of open) latest.set(review.documentId, review);
    const waiting = [];
    for (const review of latest.values()) {
        if ((reviewer !== undefined && !review.reviewers.includes(reviewer)) || !sees(review.ref)) continue;
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
 * Whether someone may publish a document before its review is approved: they
 * hold a role under `reviews.roles`.
 */
export const mayPublishPastReview = (cms: CmsService, role: string | readonly string[] | undefined): boolean =>
    hasRole(role, reviewRoles(cms));

/**
 * A publish that went past its review: the review it went past, and a time
 * before the publish, which a review recording it is dated with so it stays
 * one from before the publish.
 */
export interface PastReview {
    review: ReviewState | null;
    at: Date;
}

/**
 * Records on the review that someone published past it, once the publish
 * went through: the open review is marked `published-past-review` in their
 * name, and otherwise a new one is, so the history shows that nobody approved
 * this draft.
 */
export const recordPublishedPast = async (cms: CmsService, state: DraftState, past: PastReview, by: string): Promise<void> => {
    const decide = (id: string): Promise<void> =>
        cms.store.decideReview(id, {
            status: 'published-past-review',
            by,
            note: null,
            version: state.version,
        });
    if (past.review?.status === 'open') {
        await decide(past.review.id);
        return;
    }
    const [latest] = await cms.store.reviewsOf(state.row!.id);
    // Newest first is how a document's current review is found, so this one never shares the last one's time.
    const createdAt =
        latest !== undefined && latest.createdAt.getTime() >= past.at.getTime() ? new Date(latest.createdAt.getTime() + 1) : past.at;
    const [added] = await cms.store.addReviews([
        {
            requestId: randomUUID(),
            ref: formatRef(state.target.ref),
            documentId: state.row!.id,
            version: state.version,
            reviewers: [],
            requestedBy: by,
            note: null,
            createdAt,
        },
    ]);
    await decide(added!.id);
};

/**
 * Refuses to publish a document whose definition requires a review, until
 * its current draft is approved. Someone with a role under `reviews.roles`
 * who asks to `force` it goes past, and gets back what `recordPublishedPast`
 * records once the publish is done.
 */
export const assertReviewed = async (
    cms: CmsService,
    state: DraftState,
    publisher?: { force: boolean; role: string | readonly string[] | undefined }
): Promise<PastReview | undefined> => {
    if (state.target.definition.requireReview !== true) return undefined;
    const review = await reviewOf(cms, state);
    if (review?.status === 'approved') return undefined;
    if (publisher?.force === true && state.row !== undefined && mayPublishPastReview(cms, publisher.role)) {
        return {
            review,
            at: new Date(),
        };
    }
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
