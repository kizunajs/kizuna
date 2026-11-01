import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import { DEFAULT_SITE, type Person } from './options.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { documentLabel, peopleOf, reviewOf } from './reviews.js';
import type { EditorAccess } from './site-access.js';

/**
 * What would stop a publish, or what the person should know before it.
 * A `block` refuses the publish. A `warning` lets it through.
 */
export interface PublishIssue {
    level: 'block' | 'warning';
    kind: 'nothing' | 'permission' | 'missing' | 'language' | 'brokenLink' | 'held' | 'review' | 'schedule';
    detail: string;
    /**
     * The field it is about, by path, when it is about one.
     */
    path: string | null;
    /**
     * The site the document belongs to, or `null` for shared content.
     */
    site: string | null;
    /**
     * The language it is about, or `null` for the source.
     */
    locale: string | null;
}

export interface DocumentCheck {
    ref: string;
    title: string;
    issues: PublishIssue[];
}

/**
 * What publishing a document, or every document of a release, would run into
 * now. `ready` is false while any issue blocks.
 */
export interface PublishCheck {
    ready: boolean;
    documents: DocumentCheck[];
}

const nameOf = (people: readonly Person[], id: string): string => people.find((person) => person.id === id)?.name ?? id;

const dateOf = (at: Date): string => at.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * One document's issues. `release` is the release it publishes with, when the
 * check is of that release, whose own members link to each other freely.
 */
const checkState = async (
    cms: CmsService,
    access: EditorAccess,
    state: DraftState,
    by: string,
    people: readonly Person[],
    release?: {
        id: string;
        members: ReadonlySet<string>;
    }
): Promise<DocumentCheck> => {
    const ref = state.target.ref;
    const site = state.target.site === DEFAULT_SITE ? null : state.target.site;
    const locale = state.target.source === undefined ? null : state.target.locale;
    const issues: PublishIssue[] = [];
    const add = (issue: Omit<PublishIssue, 'site' | 'locale' | 'path'> & { path?: string | null; locale?: string | null }): void => {
        issues.push({
            path: null,
            site,
            locale,
            ...issue,
        });
    };
    const check = {
        ref: formatRef(ref),
        title: documentLabel(state),
        issues,
    };

    if (state.row === undefined || state.row.draft === null) {
        add({
            level: 'block',
            kind: 'nothing',
            detail: 'It has nothing to publish yet.',
        });
        return check;
    }
    if (state.status === 'published') {
        add({
            level: 'warning',
            kind: 'nothing',
            detail: 'Nothing changed since it was published.',
        });
    }
    if (!cms.mayPublish(access, ref)) {
        add({
            level: 'block',
            kind: 'permission',
            detail: 'You may not publish it. Ask someone who publishes here.',
        });
    }
    for (const path of state.missing) {
        add({
            level: 'block',
            kind: 'missing',
            path,
            detail: `${path} is required.`,
        });
    }
    if (locale === null) {
        const languages = await cms.documentLocales(ref);
        for (const language of languages?.locales.slice(1) ?? []) {
            if (language.status === 'empty' || language.missing.length === 0) continue;
            add({
                level: 'warning',
                kind: 'language',
                locale: language.code,
                detail: `The ${language.code} translation leaves ${language.missing.join(', ')} empty.`,
            });
        }
    }
    for (const link of await cms.brokenLinksOf(ref)) {
        // A page the same release publishes is live once the release is.
        if (link.reason === 'unpublished' && release?.members.has(link.target) === true) continue;
        add({
            level: 'warning',
            kind: 'brokenLink',
            path: link.path,
            detail:
                link.reason === 'missing'
                    ? `The link at ${link.path} points at ${link.target}, which does not exist.`
                    : link.reason === 'trashed'
                      ? `The link at ${link.path} points at ${link.target}, which is in the trash.`
                      : `The link at ${link.path} points at ${link.target}, which is not published.`,
        });
    }
    if (state.heldBy !== null && state.heldBy !== by) {
        add({
            level: 'block',
            kind: 'held',
            detail: `${nameOf(people, state.heldBy)} is editing it. It publishes once they stop.`,
        });
    }
    const review = await reviewOf(cms, state, people);
    if (state.target.definition.requireReview === true && state.status !== 'published' && review?.status !== 'approved') {
        add({
            level: 'block',
            kind: 'review',
            detail:
                review === null
                    ? 'It needs an approved review first.'
                    : review.status === 'open'
                      ? `It waits for ${review.reviewers.map((reviewer) => reviewer.name).join(' or ')} to approve.`
                      : review.status === 'changes'
                        ? `${review.decidedBy?.name ?? 'The reviewer'} asked for changes.`
                        : 'It changed since it was approved, so it needs a new approval.',
        });
    } else if (review?.status === 'open') {
        add({
            level: 'warning',
            kind: 'review',
            detail: `${review.reviewers.map((reviewer) => reviewer.name).join(' or ')} ${review.reviewers.length === 1 ? 'was' : 'were'} asked to review it and has not answered.`,
        });
    } else if (review?.status === 'changes') {
        add({
            level: 'warning',
            kind: 'review',
            detail: `${review.decidedBy?.name ?? 'The reviewer'} asked for changes.`,
        });
    }
    const schedule = state.schedule;
    // Its place in the release being checked is what publishes it, so only another schedule conflicts.
    const inChecked = release !== undefined && schedule?.release?.id === release.id;
    if (schedule !== null && !inChecked) {
        add({
            level: 'warning',
            kind: 'schedule',
            detail:
                schedule.release !== null
                    ? `It publishes with ${schedule.release.name}. Publishing it now takes it out.`
                    : schedule.action === 'unpublish'
                      ? `It is set to unpublish at ${dateOf(schedule.at!)}. Publishing it now ends that schedule.`
                      : `It is set to publish at ${dateOf(schedule.at!)}. Publishing it now ends that schedule.`,
        });
    }
    return check;
};

const result = (documents: DocumentCheck[]): PublishCheck => ({
    ready: documents.every((document) => document.issues.every((issue) => issue.level !== 'block')),
    documents,
});

/**
 * What publishing one document now would run into, saving nothing.
 */
export const checkDocument = async (cms: CmsService, access: EditorAccess, ref: DocumentRef, by: string): Promise<PublishCheck> => {
    const state = await cms.draftState(cms.canonical(access.assertSeesRef(ref)));
    return result([await checkState(cms, access, state, by, await peopleOf(cms))]);
};

/**
 * What publishing a release now would run into, document by document, saving
 * nothing.
 */
export const checkRelease = async (cms: CmsService, access: EditorAccess, id: string, by: string): Promise<PublishCheck> => {
    const release = await cms.schedules.release(id);
    if (release === undefined) throw new CmsHttpError(404, { detail: `There is no release '${id}'.` });
    const members = (await cms.schedules.members(id)).filter((member) => access.seesRef(member.ref));
    if (members.length === 0 && release.createdBy !== by) throw new CmsHttpError(404, { detail: `There is no release '${id}'.` });
    if (release.status !== 'open') {
        throw new CmsHttpError(409, {
            detail: release.status === 'published' ? `${release.name} is already published.` : `${release.name} is publishing now.`,
        });
    }
    const people = await peopleOf(cms);
    const refs = new Set(members.map((member) => member.ref));
    const documents: DocumentCheck[] = [];
    for (const member of members) {
        const ref = parseRef(member.ref);
        if (ref === undefined) continue;
        documents.push(
            await checkState(cms, access, await cms.draftState(ref), by, people, {
                id,
                members: refs,
            })
        );
    }
    if (documents.length === 0) {
        documents.push({
            ref: id,
            title: release.name,
            issues: [
                {
                    level: 'block',
                    kind: 'nothing',
                    detail: `${release.name} has no documents to publish.`,
                    path: null,
                    site: null,
                    locale: null,
                },
            ],
        });
    }
    return result(documents);
};
