import { z } from 'zod';
import { cron, Kizuna } from 'kizunajs';
import { CmsHttpError, showsOnOf, type CmsService, type DraftState } from './cms.js';
import { DEFAULT_SITE, type Person } from './options.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import {
    decideReviews,
    documentLabel,
    mayPublishPastReview,
    peopleOf,
    recordPublishedPast,
    reviewOf,
    type PastReview,
    type PersonView,
    type ReviewState,
} from './reviews.js';
import type { EditorAccess } from './site-access.js';
import { contentEvent, fireContentEvents } from './content-events.js';
import type { ReleaseRow, ScheduleAction, ScheduleRow } from './storage/schedule-store.js';

/**
 * The scheduling job's key under `content`.
 */
export const SCHEDULE_JOB = 'publishScheduled';

/**
 * How long past its time a schedule nothing stops waits before it reads as
 * late: the job has not run.
 */
export const LATE_AFTER_MS = 3 * 60_000;

export type ScheduleState = 'scheduled' | 'waiting' | 'held' | 'late';

/**
 * One scheduled document, as an editor reads it.
 */
export interface ScheduleView {
    id: string;
    ref: string;
    title: string;
    kind: string;
    site: string | null;
    action: ScheduleAction;
    at: string | null;
    release: {
        id: string;
        name: string;
    } | null;
    state: ScheduleState;
    waitingFor: string | null;
    scheduledBy: PersonView;
    createdAt: string;
    /**
     * Its latest review since it was last published, or `null`.
     */
    review: ReviewState | null;
}

/**
 * A release, as an editor reads it: only the documents they may open.
 */
export interface ReleaseView {
    id: string;
    name: string;
    at: string | null;
    state: ScheduleState | 'open' | 'published';
    waiting: number;
    documents: ScheduleView[];
    mayPublish: boolean;
    createdBy: PersonView;
    /**
     * The agent that made it for `createdBy`, like `Claude`, or `null`.
     */
    createdVia: string | null;
    createdAt: string;
    scheduledBy: PersonView | null;
    publishedAt: string | null;
    publishedBy: PersonView | null;
}

const personOf = (people: readonly Person[], id: string): PersonView => {
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

const words = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

/**
 * What kind of document it is, the way the admin's lists name them.
 */
const kindOf = (cms: CmsService, ref: DocumentRef): string => {
    if (ref.type === 'page') return 'Pages';
    if (ref.type === 'global') return 'Globals';
    try {
        return cms.collection(ref.collection, ref.site).label ?? words(ref.collection);
    } catch {
        return words(ref.collection);
    }
};

const refOf = (row: ScheduleRow): DocumentRef => {
    const ref = parseRef(row.ref);
    if (ref === undefined) throw new Error(`The schedule '${row.id}' names no document: '${row.ref}'.`);
    return ref;
};

/**
 * Whether a document shows on a site: its own site's, or shared content every
 * site shows, unless an item picks its sites.
 */
const showsOn = (cms: CmsService, state: DraftState, site: string): boolean => {
    if (state.target.site !== DEFAULT_SITE) return state.target.site === site;
    if (!cms.choosesSitesFor(state.target.ref)) return true;
    return showsOnOf(state.row?.draft ?? state.row?.published).includes(site);
};

/**
 * What would stop a schedule if it ran now, or `null`: a field the draft
 * still misses, a review it waits for, or someone editing it.
 */
export const blockOf = async (
    cms: CmsService,
    state: DraftState,
    schedule: { action: ScheduleAction; force: boolean },
    people: readonly Person[]
): Promise<string | null> => {
    if (schedule.action === 'unpublish' || state.row === undefined || state.status === 'published') return null;
    if (state.heldBy !== null) return `${personOf(people, state.heldBy).name} to finish editing`;
    if (!state.complete) return state.missing.join(', ');
    if (state.target.definition.requireReview !== true || schedule.force) return null;
    const review = await reviewOf(cms, state, people);
    if (review?.status === 'approved') return null;
    if (review === null) return 'a review';
    if (review.status === 'open') return `${review.reviewers.map((reviewer) => reviewer.name).join(' or ')} to approve`;
    if (review.status === 'changes') return `the changes ${review.decidedBy?.name ?? 'the reviewer'} asked for`;
    return 'a new approval';
};

const stateOf = (at: Date | null, block: string | null, now: Date): ScheduleState => {
    if (at === null || at.getTime() > now.getTime()) return block === null ? 'scheduled' : 'waiting';
    if (block !== null) return 'held';
    return now.getTime() - at.getTime() > LATE_AFTER_MS ? 'late' : 'scheduled';
};

const scheduleView = async (
    cms: CmsService,
    row: ScheduleRow,
    release: ReleaseRow | undefined,
    people: readonly Person[],
    now: Date
): Promise<ScheduleView & { block: string | null; draft: DraftState }> => {
    const ref = refOf(row);
    const state = await cms.draftState(ref);
    const at = release === undefined ? row.at : release.at;
    const block = await blockOf(cms, state, row, people);
    return {
        id: row.id,
        ref: row.ref,
        title: documentLabel(state),
        kind: kindOf(cms, ref),
        site: state.target.site === DEFAULT_SITE ? null : state.target.site,
        action: row.action,
        at: at?.toISOString() ?? null,
        release:
            release === undefined
                ? null
                : {
                      id: release.id,
                      name: release.name,
                  },
        state: stateOf(at, block, now),
        waitingFor: block,
        scheduledBy: personOf(people, release?.scheduledBy ?? row.createdBy),
        createdAt: row.createdAt.toISOString(),
        review: await reviewOf(cms, state, people),
        block,
        draft: state,
    };
};

const plain = ({ block: _block, draft: _draft, ...view }: Awaited<ReturnType<typeof scheduleView>>): ScheduleView => view;

/**
 * Whether an editor may schedule or publish every document of a release.
 */
const publishesAll = (cms: CmsService, access: EditorAccess, refs: readonly DocumentRef[]): boolean =>
    refs.every((ref) => access.seesRef(ref) && cms.mayPublish(access, ref));

const releaseView = async (
    cms: CmsService,
    release: ReleaseRow,
    access: EditorAccess,
    people: readonly Person[],
    now: Date
): Promise<ReleaseView & { refs: DocumentRef[]; seen: Array<Awaited<ReturnType<typeof scheduleView>>> }> => {
    const members = await cms.schedules.members(release.id);
    const refs = members.map(refOf);
    const all = await Promise.all(members.map((member) => scheduleView(cms, member, release, people, now)));
    const seen = all.filter((view) => access.seesRef(view.ref));
    const waiting = all.filter((view) => view.block !== null).length;
    const state: ReleaseView['state'] =
        release.status === 'published'
            ? 'published'
            : release.at === null
              ? 'open'
              : stateOf(release.at, waiting === 0 ? null : `${waiting}`, now);
    return {
        id: release.id,
        name: release.name,
        at: release.at?.toISOString() ?? null,
        state,
        waiting,
        documents: seen.map(plain),
        mayPublish: publishesAll(cms, access, refs),
        createdBy: personOf(people, release.createdBy),
        createdVia: release.createdVia,
        createdAt: release.createdAt.toISOString(),
        scheduledBy: release.scheduledBy === null ? null : personOf(people, release.scheduledBy),
        publishedAt: release.publishedAt?.toISOString() ?? null,
        publishedBy: release.publishedBy === null ? null : personOf(people, release.publishedBy),
        refs,
        seen,
    };
};

const publicRelease = ({ refs: _refs, seen: _seen, ...view }: Awaited<ReturnType<typeof releaseView>>): ReleaseView => view;

/**
 * Whether an editor sees a release: it holds a document they may open, or
 * they made it.
 */
const seesRelease = (view: Awaited<ReturnType<typeof releaseView>>, by: string): boolean =>
    view.seen.length > 0 || view.createdBy.id === by;

/**
 * What is set to change, for one editor: the documents scheduled on their
 * own and the releases, soonest first. With `site`, only what changes on that
 * site: its own documents and the shared ones it shows.
 */
export const listScheduled = async (
    cms: CmsService,
    access: EditorAccess,
    by: string,
    site: string | undefined
): Promise<{ schedules: ScheduleView[]; releases: ReleaseView[] }> => {
    if (site !== undefined) access.assertSees(site);
    const people = await peopleOf(cms);
    const now = new Date();
    const own = (await cms.schedules.pending()).filter((row) => row.releaseId === null && access.seesRef(row.ref));
    const schedules = (await Promise.all(own.map((row) => scheduleView(cms, row, undefined, people, now)))).filter(
        (view) => site === undefined || showsOn(cms, view.draft, site)
    );
    const releases = (
        await Promise.all((await cms.schedules.openReleases()).map((release) => releaseView(cms, release, access, people, now)))
    )
        .filter((view) => seesRelease(view, by))
        .filter((view) => site === undefined || view.seen.length === 0 || view.seen.some((document) => showsOn(cms, document.draft, site)));
    const time = (at: string | null): number => (at === null ? Number.POSITIVE_INFINITY : Date.parse(at));
    return {
        schedules: schedules.sort((first, second) => time(first.at) - time(second.at)).map(plain),
        releases: releases.sort((first, second) => time(first.at) - time(second.at)).map(publicRelease),
    };
};

/**
 * A draft with changes that could join a release.
 */
export interface DraftCandidate {
    ref: string;
    title: string;
    kind: string;
    site: string | null;
    updatedAt: string;
    updatedBy: PersonView;
    /**
     * The release it is in, or whether it is scheduled on its own.
     */
    scheduled: boolean;
}

/**
 * Every draft with changes an editor may open, newest first. With `site`,
 * only that site's and the shared ones it shows.
 */
export const draftsWithChanges = async (cms: CmsService, access: EditorAccess, site: string | undefined): Promise<DraftCandidate[]> => {
    if (site !== undefined) access.assertSees(site);
    const people = await peopleOf(cms);
    const found: DraftCandidate[] = [];
    for (const { target, row } of await cms.declaredDocuments()) {
        if (row.draft === null || !access.seesRef(target.ref)) continue;
        if (row.published !== null && row.publishedVersion === (await cms.store.latestVersion(row.id))) continue;
        const state = await cms.draftState(target.ref);
        if (site !== undefined && !showsOn(cms, state, site)) continue;
        found.push({
            ref: formatRef(target.ref),
            title: documentLabel(state),
            kind: kindOf(cms, target.ref),
            site: target.site === DEFAULT_SITE ? null : target.site,
            updatedAt: row.updatedAt.toISOString(),
            updatedBy: personOf(people, row.updatedBy),
            scheduled: state.schedule !== null,
        });
    }
    return found.sort((first, second) => Date.parse(second.updatedAt) - Date.parse(first.updatedAt));
};

const refuseIfPast = (at: Date): void => {
    if (at.getTime() <= Date.now()) {
        throw new CmsHttpError(422, {
            detail: 'That time has passed. Pick a time in the future, or publish now.',
            errors: [],
        });
    }
};

const forceFor = (cms: CmsService, access: EditorAccess, ref: DocumentRef, force: boolean | undefined): boolean =>
    force === true && mayPublishPastReview(cms, access.callerFor(ref).role);

/**
 * Schedules a document to publish or unpublish on its own, replacing a time
 * it had. A document in a release leaves it first.
 */
export const scheduleDocument = async (
    cms: CmsService,
    access: EditorAccess,
    ref: DocumentRef,
    body: { action: ScheduleAction; at: string; force?: boolean },
    by: string
): Promise<ScheduleView> => {
    const at = new Date(body.at);
    refuseIfPast(at);
    const state = await cms.draftState(ref);
    if (state.row === undefined) {
        throw new CmsHttpError(404, {
            detail: `'${formatRef(ref)}' has nothing to publish yet.`,
        });
    }
    const pending = await cms.schedules.pendingFor(state.row.id);
    if (pending?.releaseId !== null && pending !== undefined) {
        const release = await cms.schedules.release(pending.releaseId);
        throw new CmsHttpError(409, {
            detail: `${documentLabel(state)} publishes with ${release?.name ?? 'a release'}. Take it out of the release first.`,
        });
    }
    if (pending?.status === 'running') {
        throw new CmsHttpError(409, {
            detail: `${documentLabel(state)} is publishing now.`,
        });
    }
    const row = await cms.schedules.schedule({
        ref: formatRef(state.target.ref),
        documentId: state.row.id,
        action: body.action,
        at,
        force: forceFor(cms, access, ref, body.force),
        createdBy: by,
    });
    await fireContentEvents(cms, [
        contentEvent(cms, state.target, 'scheduled', by, {
            schedule: {
                action: body.action,
                at: at.toISOString(),
            },
        }),
    ]);
    return plain(await scheduleView(cms, row, undefined, await peopleOf(cms), new Date()));
};

/**
 * Ends a document's schedule, taking it out of its release. Answers whether
 * it had one.
 */
export const cancelSchedule = async (cms: CmsService, ref: DocumentRef): Promise<boolean> => {
    const state = await cms.draftState(ref);
    return state.row === undefined ? false : cms.schedules.endFor(state.row.id);
};

/**
 * Ends a document's pending schedule after it was published or unpublished
 * by hand, which is what the schedule was for.
 */
export const endScheduleOf = async (cms: CmsService, ref: DocumentRef): Promise<void> => {
    const { row } = await cms.document(ref);
    if (row !== undefined) await cms.schedules.endFor(row.id);
};

const releaseOrMissing = async (cms: CmsService, access: EditorAccess, id: string, by: string) => {
    const release = await cms.schedules.release(id);
    if (release === undefined) throw new CmsHttpError(404, { detail: `There is no release '${id}'.` });
    const view = await releaseView(cms, release, access, await peopleOf(cms), new Date());
    if (!seesRelease(view, by)) throw new CmsHttpError(404, { detail: `There is no release '${id}'.` });
    return {
        release,
        view,
    };
};

const assertOpen = (release: ReleaseRow): void => {
    if (release.status !== 'open') {
        throw new CmsHttpError(409, {
            detail: release.status === 'published' ? `${release.name} is already published.` : `${release.name} is publishing now.`,
        });
    }
};

const assertPublishesAll = (cms: CmsService, access: EditorAccess, release: ReleaseRow, refs: readonly DocumentRef[]): void => {
    if (!publishesAll(cms, access, refs)) {
        throw new CmsHttpError(403, {
            detail: `${release.name} holds documents you may not publish. Ask someone who publishes all of them.`,
        });
    }
};

export const getRelease = async (cms: CmsService, access: EditorAccess, id: string, by: string): Promise<ReleaseView> =>
    publicRelease((await releaseOrMissing(cms, access, id, by)).view);

/**
 * Puts documents in a release. Each must be one the editor may open, with a
 * draft, and not scheduled already.
 */
const addRefs = async (cms: CmsService, access: EditorAccess, release: ReleaseRow, refs: readonly string[], by: string): Promise<void> => {
    const added: DraftState[] = [];
    for (const value of refs) {
        const parsed = parseRef(value);
        if (parsed === undefined) throw new CmsHttpError(422, { detail: `'${value}' names no document.`, errors: [] });
        const ref = cms.canonical(access.assertSeesRef(parsed));
        const state = await cms.draftState(ref);
        if (state.row === undefined) throw new CmsHttpError(404, { detail: `'${value}' has nothing to publish yet.` });
        const pending = await cms.schedules.pendingFor(state.row.id);
        if (pending !== undefined && pending.releaseId === release.id) continue;
        if (pending !== undefined) {
            const other = pending.releaseId === null ? undefined : await cms.schedules.release(pending.releaseId);
            throw new CmsHttpError(409, {
                detail:
                    other === undefined
                        ? `${documentLabel(state)} is already scheduled. Cancel its schedule first.`
                        : `${documentLabel(state)} publishes with ${other.name}. Take it out of that release first.`,
            });
        }
        await cms.schedules.schedule({
            ref: formatRef(state.target.ref),
            documentId: state.row.id,
            action: 'publish',
            at: null,
            force: false,
            createdBy: by,
            releaseId: release.id,
        });
        added.push(state);
    }
    if (release.at !== null) await fireScheduled(cms, release, release.at, added, by);
};

/**
 * One `scheduled` event per document a timed release publishes.
 */
const fireScheduled = async (cms: CmsService, release: ReleaseRow, at: Date, states: readonly DraftState[], by: string): Promise<void> => {
    await fireContentEvents(
        cms,
        states.map((state) =>
            contentEvent(cms, state.target, 'scheduled', by, {
                release: {
                    id: release.id,
                    name: release.name,
                },
                schedule: {
                    action: 'publish',
                    at: at.toISOString(),
                },
            })
        )
    );
};

export const createRelease = async (
    cms: CmsService,
    access: EditorAccess,
    body: { name: string; refs: readonly string[] },
    by: string
): Promise<ReleaseView> => {
    const release = await cms.schedules.createRelease(body.name, by);
    try {
        await addRefs(cms, access, release, body.refs, by);
    } catch (error) {
        await cms.schedules.deleteRelease(release.id);
        throw error;
    }
    return getRelease(cms, access, release.id, by);
};

export const renameRelease = async (cms: CmsService, access: EditorAccess, id: string, name: string, by: string): Promise<ReleaseView> => {
    const { release } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    await cms.schedules.renameRelease(id, name);
    return getRelease(cms, access, id, by);
};

export const addToRelease = async (
    cms: CmsService,
    access: EditorAccess,
    id: string,
    refs: readonly string[],
    by: string
): Promise<ReleaseView> => {
    const { release } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    await addRefs(cms, access, release, refs, by);
    return getRelease(cms, access, id, by);
};

export const removeFromRelease = async (
    cms: CmsService,
    access: EditorAccess,
    id: string,
    refs: readonly string[],
    by: string
): Promise<ReleaseView> => {
    const { release, view } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    const wanted = new Set(
        refs.map((value) => {
            const parsed = parseRef(value);
            return parsed === undefined ? value : formatRef(cms.canonical(parsed));
        })
    );
    for (const document of view.seen) {
        if (wanted.has(document.ref) && document.draft.row !== undefined) await cms.schedules.endFor(document.draft.row.id);
    }
    return getRelease(cms, access, id, by);
};

export const scheduleRelease = async (
    cms: CmsService,
    access: EditorAccess,
    id: string,
    body: { at: string; force?: boolean },
    by: string
): Promise<ReleaseView> => {
    const { release, view } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    assertPublishesAll(cms, access, release, view.refs);
    const at = new Date(body.at);
    refuseIfPast(at);
    const force = body.force === true && view.refs.every((ref) => mayPublishPastReview(cms, access.callerFor(ref).role));
    await cms.schedules.timeRelease(id, at, by, force);
    const members = await cms.schedules.members(id);
    await fireScheduled(cms, release, at, await Promise.all(members.map((member) => cms.draftState(refOf(member)))), by);
    return getRelease(cms, access, id, by);
};

export const unscheduleRelease = async (cms: CmsService, access: EditorAccess, id: string, by: string): Promise<ReleaseView> => {
    const { release } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    await cms.schedules.timeRelease(id, null, null, false);
    return getRelease(cms, access, id, by);
};

export const deleteRelease = async (cms: CmsService, access: EditorAccess, id: string, by: string): Promise<void> => {
    const { release, view } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    if (release.createdBy !== by) assertPublishesAll(cms, access, release, view.refs);
    await cms.schedules.deleteRelease(id);
};

/**
 * Sends a release back to whoever made it, like an agent's: asks for changes
 * on each of its documents that waits for the editor's review, with one note
 * for them all. The release stays open for the new drafts.
 */
export const sendBackRelease = async (
    cms: CmsService,
    access: EditorAccess,
    id: string,
    note: string,
    by: string
): Promise<ReleaseView> => {
    const { release, view } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    const open = view.seen.flatMap((document) => (document.review?.status === 'open' ? [document.review.id] : []));
    if (open.length === 0) {
        throw new CmsHttpError(409, {
            detail: `Nothing in ${release.name} waits for a review, so there is nothing to send back.`,
        });
    }
    await decideReviews(cms, {
        ids: open,
        decision: 'requestChanges',
        note,
        by,
        roleOn: (ref) => access.callerFor(ref).role,
    });
    return getRelease(cms, access, id, by);
};

const pastReviewOf = async (
    cms: CmsService,
    state: DraftState,
    force: boolean,
    people: readonly Person[]
): Promise<PastReview | undefined> => {
    if (!force || state.target.definition.requireReview !== true) return undefined;
    const review = await reviewOf(cms, state, people);
    return review?.status === 'approved'
        ? undefined
        : {
              review,
              at: new Date(),
          };
};

/**
 * Publishes a claimed release's documents together, or refuses with what
 * stops it. Answers how many documents went live.
 */
const runRelease = async (cms: CmsService, release: ReleaseRow, by: string, force: boolean, people: readonly Person[]): Promise<number> => {
    const members = await cms.schedules.members(release.id);
    const states = await Promise.all(members.map((member) => cms.draftState(refOf(member))));
    const blocked: string[] = [];
    for (const [index, state] of states.entries()) {
        const block = await blockOf(
            cms,
            state,
            {
                action: members[index]!.action,
                force: force || members[index]!.force,
            },
            people
        );
        if (block !== null) blocked.push(`${documentLabel(state)} waits for ${block}`);
    }
    if (blocked.length > 0) {
        throw new CmsHttpError(409, {
            detail: `${release.name} cannot publish yet. ${blocked.join('. ')}.`,
            waiting: blocked,
        });
    }
    const live = states
        .map((state, index) => ({
            state,
            member: members[index]!,
        }))
        .filter(({ state }) => state.row !== undefined && state.status !== 'published');
    const pasts = await Promise.all(live.map(({ state }) => pastReviewOf(cms, state, force, people)));
    const versions =
        live.length === 0
            ? new Map<string, number | null>()
            : await cms.publishTogether(
                  live.map(({ state }) => state.target.ref),
                  by,
                  {
                      id: release.id,
                      name: release.name,
                  }
              );
    for (const [index, { state }] of live.entries()) {
        const past = pasts[index];
        if (past !== undefined) await recordPublishedPast(cms, state, past, by);
    }
    await cms.schedules.finishRelease(release.id, by, new Map(members.map((member) => [member.id, versions.get(member.ref) ?? null])));
    return live.length;
};

/**
 * Publishes a release now, as the editor, after the same checks the job
 * makes.
 */
export const publishRelease = async (
    cms: CmsService,
    access: EditorAccess,
    id: string,
    force: boolean | undefined,
    by: string
): Promise<ReleaseView> => {
    const { release, view } = await releaseOrMissing(cms, access, id, by);
    assertOpen(release);
    assertPublishesAll(cms, access, release, view.refs);
    if (view.refs.length === 0) throw new CmsHttpError(409, { detail: `${release.name} has no documents to publish.` });
    if (!(await cms.schedules.claimRelease(id))) throw new CmsHttpError(409, { detail: `${release.name} is publishing now.` });
    const allowed = force === true && view.refs.every((ref) => mayPublishPastReview(cms, access.callerFor(ref).role));
    try {
        await runRelease(cms, release, by, allowed, await peopleOf(cms));
    } catch (error) {
        await cms.schedules.unclaimRelease(id);
        throw error;
    }
    return getRelease(cms, access, id, by);
};

/**
 * Runs everything whose time has come: each document scheduled on its own,
 * then each release. A schedule something stops stays for the next tick.
 */
export const runDue = async (cms: CmsService, now = new Date()): Promise<{ published: number; held: number }> => {
    const people = await peopleOf(cms);
    let published = 0;
    let held = 0;
    for (const row of await cms.schedules.due(now)) {
        if (!(await cms.schedules.claim(row.id))) continue;
        try {
            const ref = refOf(row);
            const state = await cms.draftState(ref);
            if (row.action === 'unpublish') {
                if (state.row?.published !== null && state.row?.published !== undefined) {
                    await cms.unpublish(ref, row.createdBy);
                    published += 1;
                }
                await cms.schedules.finish(row.id, null);
                continue;
            }
            if (state.row === undefined || state.status === 'published') {
                await cms.schedules.finish(row.id, state.row?.publishedVersion ?? null);
                continue;
            }
            if ((await blockOf(cms, state, row, people)) !== null) {
                await cms.schedules.unclaim([row.id]);
                held += 1;
                continue;
            }
            const past = await pastReviewOf(cms, state, row.force, people);
            const after = await cms.publish(ref, row.createdBy);
            if (past !== undefined) await recordPublishedPast(cms, state, past, row.createdBy);
            await cms.schedules.finish(row.id, after.row?.publishedVersion ?? null);
            published += 1;
        } catch (error) {
            await cms.schedules.unclaim([row.id]);
            held += 1;
            console.warn(
                `[kizuna-cms] The schedule of '${row.ref}' did not run: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    for (const release of await cms.schedules.dueReleases(now)) {
        if (!(await cms.schedules.claimRelease(release.id))) continue;
        try {
            published += await runRelease(cms, release, release.scheduledBy ?? release.createdBy, release.force, people);
        } catch (error) {
            await cms.schedules.unclaimRelease(release.id);
            held += 1;
            if (!(error instanceof CmsHttpError)) {
                console.warn(`[kizuna-cms] ${release.name} did not publish: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return {
        published,
        held,
    };
};

const k = new Kizuna();

/**
 * The job that runs every minute and publishes what is due.
 */
export const publishScheduledJob = (slug: string) =>
    k
        .job({
            summary: 'Publish and unpublish the drafts and releases whose time has come',
            schedule: cron.every('1m'),
            result: z.object({
                published: z.int(),
                held: z.int(),
            }),
        })
        .handler(async (args) => {
            const plugins = (args as unknown as { plugins: Record<string, { service: CmsService } | undefined> }).plugins;
            const service = plugins[slug]?.service;
            if (service === undefined) throw new Error(`The scheduling job found no CMS at plugins.${slug}.`);
            return {
                status: 200,
                body: await runDue(service),
            };
        });
