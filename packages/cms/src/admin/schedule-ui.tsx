import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Checkbox } from '@base-ui/react/checkbox';
import { Menu } from '@base-ui/react/menu';
import { Toast } from '@base-ui/react/toast';
import { CalendarClock, Check, CircleAlert, FileText, Layers, List, Plus, Search, X } from 'lucide-react';
import type { Connection } from '../view/connection.js';
import { ICON } from '../view/context.js';
import { Avatar } from '../view/people.js';
import { clockOf, dayOf, defaultLaterOf, isoOf, localPartsOf, whenOf, zoneNameOf } from '../view/schedule-time.js';
import type { DraftSchedule, PersonView, ReviewState } from '../view/schema.js';
import { parseRef } from '../refs.js';
import type { AdminSite } from './config.js';
import { ConfirmDialog, type Confirmation } from './confirm.js';
import { hrefIn, hrefOf, navigate, SHARED_GROUP } from './navigation.js';
import { PageHeader, type MetaPair } from './page-header.js';
import { problemOf } from './parts.js';
import { SendBack } from './review-changes.js';
import { SiteIcon } from './site-switcher.js';

/**
 * One scheduled document, as the schedules route answers it.
 */
export interface ScheduleView {
    id: string;
    ref: string;
    title: string;
    kind: string;
    site: string | null;
    action: 'publish' | 'unpublish';
    at: string | null;
    release: {
        id: string;
        name: string;
    } | null;
    state: 'scheduled' | 'waiting' | 'held' | 'late';
    waitingFor: string | null;
    scheduledBy: PersonView;
    /**
     * Its latest review since it was last published. Older servers leave it
     * out.
     */
    review?: ReviewState | null;
}

/**
 * A release, with the documents the editor may open.
 */
export interface ReleaseView {
    id: string;
    name: string;
    at: string | null;
    state: 'open' | 'scheduled' | 'waiting' | 'held' | 'late' | 'published';
    waiting: number;
    documents: ScheduleView[];
    mayPublish: boolean;
    createdBy: PersonView;
    /**
     * The agent that made it for `createdBy`, like `Claude`. Older servers
     * leave it out.
     */
    createdVia?: string | null;
    scheduledBy: PersonView | null;
    publishedAt: string | null;
}

interface DraftCandidate {
    ref: string;
    title: string;
    kind: string;
    site: string | null;
    updatedAt: string;
    scheduled: boolean;
}

const releaseHref = (site: string | undefined, id: string): string =>
    hrefIn(site, {
        kind: 'release',
        id,
    });

const scheduledHref = (site: string | undefined): string =>
    hrefIn(site, {
        kind: 'scheduled',
    });

const documentHref = (ref: string): string =>
    hrefOf({
        kind: 'document',
        ref,
    });

/**
 * A row's state: what it waits for in the ink, or a quiet one in grey.
 */
const said = (text: string, quiet = false): { text: string; quiet: boolean } => ({
    text,
    quiet,
});

const peopleLine = (lead: string, person: PersonView, after = ''): ReactNode => (
    <span className="k-fact-people">
        {lead}
        <Avatar person={person} />
        <span>{person.name}</span>
        {after === '' ? null : after}
    </span>
);

/**
 * The header's fact for a scheduled document: when it publishes or
 * unpublishes, and who set it, or the release it goes out with. A page that
 * waits for its review says who it waits for, and one whose time passed
 * says since when it is held.
 */
export const scheduleFactOf = (input: {
    schedule: DraftSchedule | null | undefined;
    review: ReviewState | null;
    requireReview: boolean;
    by: PersonView | undefined;
    now: Date;
}): MetaPair | null => {
    const { schedule, review, requireReview, by, now } = input;
    if (schedule === null || schedule === undefined) return null;
    if (schedule.release !== null) {
        return {
            label: 'Release',
            value: (
                <span>
                    <a href={releaseHref(undefined, schedule.release.id)}>{schedule.release.name}</a>
                    {schedule.at === null ? null : `, ${whenOf(schedule.at)}`}
                </span>
            ),
        };
    }
    if (schedule.at === null) return null;
    const passed = Date.parse(schedule.at) <= now.getTime();
    const label = passed ? 'Held since' : schedule.action === 'publish' ? 'Publishes' : 'Unpublishes';
    const when = whenOf(schedule.at);
    if (schedule.action === 'publish' && requireReview && review?.status === 'open') {
        return {
            label,
            value: `${when} once ${review.reviewers.map((reviewer) => reviewer.name).join(' or ')} approves`,
        };
    }
    return {
        label,
        value: by === undefined ? when : peopleLine(`${when}, set by`, by),
    };
};

const KIND_ICONS = {
    page: FileText,
    item: List,
};

const iconOf = (ref: string) => {
    const parsed = parseRef(ref);
    return parsed?.type === 'page' ? KIND_ICONS.page : KIND_ICONS.item;
};

const detailOf = (view: { kind: string; site: string | null }, sites: readonly AdminSite[]): string =>
    view.site === null && sites.length > 0 ? `${view.kind} · ${SHARED_GROUP}` : view.kind;

const stateOf = (view: { state: string; waitingFor: string | null }): { text: string; quiet: boolean } => {
    if (view.state === 'held') return said(`Held: waiting for ${view.waitingFor ?? 'a change'}`);
    if (view.state === 'waiting') return said(`Waiting for ${view.waitingFor ?? 'a change'}`);
    if (view.state === 'late') return said('Late');
    return said('Ready', true);
};

/**
 * A document's state in a release: what stops it, else where its review
 * stands, which an agent's release waits on before anyone publishes it.
 */
export const releaseDocumentStateOf = (view: Pick<ScheduleView, 'state' | 'waitingFor' | 'review'>): { text: string; quiet: boolean } => {
    const state = stateOf(view);
    if (!state.quiet) return state;
    if (view.review?.status === 'open')
        return said(`Waiting for ${view.review.reviewers.map((reviewer) => reviewer.name).join(' or ')} to review`);
    if (view.review?.status === 'changes') return said(`Sent back by ${view.review.decidedBy?.name ?? 'the reviewer'}`);
    if (view.review?.status === 'approved') return said('Approved', true);
    return state;
};

const releaseStateOf = (release: ReleaseView): { text: string; quiet: boolean } => {
    if (release.state === 'held') return said(`Held: ${release.waiting === 1 ? '1 document waits' : `${release.waiting} documents wait`}`);
    if (release.waiting > 0)
        return { text: release.waiting === 1 ? '1 document waits' : `${release.waiting} documents wait`, quiet: false };
    if (release.state === 'late') return said('Late');
    return said('Ready', true);
};

/**
 * The fields that pick a date and a time in the browser's zone.
 */
function TimeFields({
    date,
    time,
    onDate,
    onTime,
}: {
    date: string;
    time: string;
    onDate: (value: string) => void;
    onTime: (value: string) => void;
}) {
    const at = isoOf(date, time);
    return (
        <div className="k-schedule-when__fields">
            <label className="k-schedule-when__field">
                <span className="k-schedule-when__label">Date</span>
                <input
                    type="date"
                    className="k-input"
                    value={date}
                    min={localPartsOf(new Date().toISOString()).date}
                    onChange={(event) => onDate(event.target.value)}
                />
            </label>
            <label className="k-schedule-when__field">
                <span className="k-schedule-when__label">Time</span>
                <input type="time" className="k-input" value={time} onChange={(event) => onTime(event.target.value)} />
            </label>
            {at === undefined ? null : <span className="k-schedule-when__zone">{zoneNameOf(at)}</span>}
        </div>
    );
}

/**
 * Asks for a release's name, makes it, and opens it.
 */
function NewReleaseDialog({
    connection,
    site,
    open,
    onOpenChange,
}: {
    connection: Connection;
    site: string | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [name, setName] = useState('');
    const [problem, setProblem] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    const nameId = useId();
    useEffect(() => {
        if (!open) return;
        setName('');
        setProblem(undefined);
    }, [open]);
    const create = async (): Promise<void> => {
        setBusy(true);
        const answer = await connection.call<ReleaseView>('editing_releases_create', {
            body: {
                name: name.trim(),
                refs: [],
            },
        });
        setBusy(false);
        if (answer.status !== 201) {
            setProblem(problemOf(answer, 'The release was not made'));
            return;
        }
        onOpenChange(false);
        navigate(releaseHref(site, answer.body.id));
    };
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-release-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">New release</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <form
                        className="k-release-dialog__body"
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (name.trim() !== '') void create();
                        }}>
                        <label className="k-schedule-when__field" htmlFor={nameId}>
                            <span className="k-schedule-when__label">Name</span>
                        </label>
                        <input
                            id={nameId}
                            className="k-input"
                            value={name}
                            autoFocus
                            maxLength={80}
                            onChange={(event) => setName(event.target.value)}
                        />
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                        <div className="k-dialog__actions">
                            <Dialog.Close className="k-button k-button--secondary">Cancel</Dialog.Close>
                            <button type="submit" className="k-button k-button--primary" disabled={busy || name.trim() === ''}>
                                {busy ? 'Making it' : 'Create release'}
                            </button>
                        </div>
                    </form>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * Scheduled: what is set to change on a site, soonest first under each day,
 * documents on their own and releases as one row each.
 */
export function ScheduledScreen({
    connection,
    site,
    sites,
}: {
    connection: Connection;
    site: string | undefined;
    sites: readonly AdminSite[];
}) {
    const [scheduled, setScheduled] = useState<{ schedules: ScheduleView[]; releases: ReleaseView[] } | undefined>();
    const [creating, setCreating] = useState(false);
    const now = useMemo(() => new Date(), [scheduled]);
    useEffect(() => {
        void connection
            .call<{ schedules: ScheduleView[]; releases: ReleaseView[] }>('editing_schedules_list', {
                query:
                    site === undefined
                        ? {}
                        : {
                              site,
                          },
            })
            .then((answer) =>
                setScheduled(
                    answer.status === 200
                        ? answer.body
                        : {
                              schedules: [],
                              releases: [],
                          }
                )
            );
    }, [connection, site]);
    const rows = useMemo(() => {
        if (scheduled === undefined) return undefined;
        return [
            ...scheduled.schedules.map((schedule) => ({
                key: schedule.id,
                at: schedule.at,
                href: documentHref(schedule.ref),
                Icon: iconOf(schedule.ref),
                title: schedule.title,
                detail: detailOf(schedule, sites),
                action: schedule.action === 'publish' ? 'Publishes' : 'Unpublishes',
                by: schedule.scheduledBy,
                state: stateOf(schedule),
            })),
            ...scheduled.releases.map((release) => ({
                key: release.id,
                at: release.at,
                href: releaseHref(site, release.id),
                Icon: Layers,
                title: release.name,
                detail: `Release · ${release.documents.length === 1 ? '1 document' : `${release.documents.length} documents`}`,
                action: 'Publishes',
                by: release.scheduledBy ?? release.createdBy,
                state: release.at === null ? said('No time yet', true) : releaseStateOf(release),
            })),
        ].sort(
            (first, second) =>
                (first.at === null ? Infinity : Date.parse(first.at)) - (second.at === null ? Infinity : Date.parse(second.at))
        );
    }, [scheduled, site, sites]);
    const days = useMemo(() => {
        const grouped = new Map<string, NonNullable<typeof rows>>();
        for (const row of rows ?? []) {
            const day = row.at === null ? 'No time yet' : dayOf(row.at, now);
            grouped.set(day, [...(grouped.get(day) ?? []), row]);
        }
        return [...grouped];
    }, [rows, now]);
    const upcoming = (rows ?? []).filter((row) => row.at !== null);
    const next = upcoming[0];
    return (
        <>
            <PageHeader
                title="Scheduled"
                meta={
                    rows === undefined
                        ? undefined
                        : [
                              {
                                  label: 'Upcoming',
                                  value: upcoming.length,
                              },
                              next?.at === null || next?.at === undefined
                                  ? null
                                  : {
                                        label: 'Next',
                                        value: `${dayOf(next.at, now)}, ${clockOf(next.at)}`,
                                    },
                          ]
                }
                actions={
                    <button type="button" className="k-button k-button--secondary k-button--small" onClick={() => setCreating(true)}>
                        <Plus {...ICON} />
                        New release
                    </button>
                }
            />
            <div className="k-admin__body k-scheduled">
                {rows === undefined ? null : rows.length === 0 ? (
                    <div className="k-list-results__empty">
                        <h2 className="k-list-results__empty-title">Nothing is scheduled</h2>
                    </div>
                ) : (
                    days.map(([day, entries]) => (
                        <section key={day} className="k-scheduled__day">
                            <h2 className="k-scheduled__day-title">{day}</h2>
                            <div className="k-scheduled__rows">
                                {entries.map((row) => (
                                    <a key={row.key} className="k-scheduled__row" href={row.href}>
                                        <span className="k-scheduled__time">{row.at === null ? '' : clockOf(row.at).split(' ')[0]}</span>
                                        <row.Icon {...ICON} className="k-scheduled__icon" />
                                        <span className="k-scheduled__title">
                                            <span className="k-ellipsis">{row.title}</span>
                                            <span className="k-scheduled__detail k-ellipsis">{row.detail}</span>
                                        </span>
                                        <span className="k-scheduled__action">{row.action}</span>
                                        <span className="k-scheduled__by">
                                            <Avatar person={row.by} size={20} />
                                            <span className="k-ellipsis">{row.by.name}</span>
                                        </span>
                                        <span className="k-scheduled__state" data-quiet={row.state.quiet ? '' : undefined}>
                                            {row.state.text}
                                        </span>
                                    </a>
                                ))}
                            </div>
                        </section>
                    ))
                )}
            </div>
            <NewReleaseDialog connection={connection} site={site} open={creating} onOpenChange={setCreating} />
        </>
    );
}

/**
 * Picks the drafts to put in a release: every draft with changes the editor
 * may edit and that nothing schedules yet.
 */
function AddDocumentsDialog({
    connection,
    release,
    site,
    open,
    onOpenChange,
    onAdded,
}: {
    connection: Connection;
    release: ReleaseView;
    site: string | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: (release: ReleaseView) => void;
}) {
    const [drafts, setDrafts] = useState<DraftCandidate[] | undefined>();
    const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
    const [query, setQuery] = useState('');
    const [problem, setProblem] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setDrafts(undefined);
        setChosen(new Set());
        setQuery('');
        setProblem(undefined);
        void connection
            .call<{ drafts: DraftCandidate[] }>('editing_schedules_drafts', {
                query:
                    site === undefined
                        ? {}
                        : {
                              site,
                          },
            })
            .then((answer) => setDrafts(answer.status === 200 ? answer.body.drafts.filter((draft) => !draft.scheduled) : []));
    }, [open, connection, site]);
    const term = query.trim().toLowerCase();
    const shown = (drafts ?? []).filter((draft) => term === '' || `${draft.title} ${draft.kind}`.toLowerCase().includes(term));
    const add = async (): Promise<void> => {
        setBusy(true);
        const answer = await connection.call<ReleaseView>('editing_releases_add', {
            params: {
                id: release.id,
            },
            body: {
                refs: [...chosen],
            },
        });
        setBusy(false);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'They were not added'));
            return;
        }
        onAdded(answer.body);
        onOpenChange(false);
    };
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-release-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">Add documents</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <div className="k-release-dialog__body">
                        <label className="k-list-toolbar__search k-release-dialog__search">
                            <Search {...ICON} />
                            <span className="k-visually-hidden">Search drafts</span>
                            <input
                                type="search"
                                value={query}
                                placeholder="Search drafts"
                                onChange={(event) => setQuery(event.target.value)}
                            />
                        </label>
                        {drafts === undefined ? null : shown.length === 0 ? (
                            <p className="k-release-dialog__none">
                                {drafts.length === 0 ? 'No drafts wait to go live.' : 'Nothing matches.'}
                            </p>
                        ) : (
                            <div className="k-release-dialog__list">
                                {shown.map((draft) => {
                                    const Icon = iconOf(draft.ref);
                                    return (
                                        <label key={draft.ref} className="k-release-dialog__row">
                                            <Checkbox.Root
                                                className="k-check"
                                                checked={chosen.has(draft.ref)}
                                                onCheckedChange={() =>
                                                    setChosen((previous) => {
                                                        const next = new Set(previous);
                                                        if (next.has(draft.ref)) next.delete(draft.ref);
                                                        else next.add(draft.ref);
                                                        return next;
                                                    })
                                                }>
                                                <Checkbox.Indicator className="k-check__indicator">
                                                    <Check {...ICON} />
                                                </Checkbox.Indicator>
                                            </Checkbox.Root>
                                            <Icon {...ICON} className="k-scheduled__icon" />
                                            <span className="k-scheduled__title">
                                                <span className="k-ellipsis">{draft.title}</span>
                                                <span className="k-scheduled__detail k-ellipsis">{draft.kind}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                    </div>
                    <div className="k-dialog__actions">
                        <Dialog.Close className="k-button k-button--secondary">Cancel</Dialog.Close>
                        <button
                            type="button"
                            className="k-button k-button--primary"
                            disabled={busy || chosen.size === 0}
                            onClick={() => void add()}>
                            {chosen.size > 1 ? `Add ${chosen.size} documents` : 'Add'}
                        </button>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

/**
 * Picks the time a release publishes, listing what goes live with it.
 */
function ScheduleReleaseDialog({
    connection,
    release,
    open,
    onOpenChange,
    onScheduled,
}: {
    connection: Connection;
    release: ReleaseView;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onScheduled: (release: ReleaseView) => void;
}) {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [problem, setProblem] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        const start = release.at === null ? defaultLaterOf() : localPartsOf(release.at);
        setDate(start.date);
        setTime(start.time);
        setProblem(undefined);
    }, [open, release.at]);
    const at = isoOf(date, time);
    const passed = at !== undefined && Date.parse(at) <= Date.now();
    const schedule = async (): Promise<void> => {
        if (at === undefined) return;
        setBusy(true);
        // The person confirmed the time in this dialog, so the route runs without asking again.
        const answer = await connection.call<ReleaseView>(
            'editing_releases_schedule',
            {
                params: {
                    id: release.id,
                },
                body: {
                    at,
                },
            },
            {
                approved: true,
            }
        );
        setBusy(false);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'It was not scheduled'));
            return;
        }
        onScheduled(answer.body);
        onOpenChange(false);
    };
    const count = release.documents.length;
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-release-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">Schedule {release.name}?</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <Dialog.Description className="k-help">
                        {count === 1 ? '1 document goes live.' : `${count} documents go live together.`}
                    </Dialog.Description>
                    <div className="k-release-dialog__body">
                        <div className="k-release-dialog__list">
                            {release.documents.map((document) => {
                                const Icon = iconOf(document.ref);
                                return (
                                    <div key={document.ref} className="k-release-dialog__row">
                                        <Icon {...ICON} className="k-scheduled__icon" />
                                        <span className="k-scheduled__title">
                                            <span className="k-ellipsis">{document.title}</span>
                                            <span className="k-scheduled__detail k-ellipsis">{document.kind}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <TimeFields date={date} time={time} onDate={setDate} onTime={setTime} />
                        {passed ? (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                That time has passed.
                            </p>
                        ) : null}
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                    </div>
                    <div className="k-dialog__actions">
                        <Dialog.Close className="k-button k-button--secondary">Cancel</Dialog.Close>
                        <button
                            type="button"
                            className="k-button k-button--primary"
                            disabled={busy || at === undefined || passed}
                            onClick={() => void schedule()}>
                            {busy ? 'Scheduling' : 'Schedule'}
                        </button>
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

type ReleaseConfirm = 'publish' | 'delete' | 'unschedule';

/**
 * A release's page: its documents under each site, what each waits for, and
 * the time it publishes.
 */
export function ReleaseScreen({
    connection,
    id,
    site,
    sites,
}: {
    connection: Connection;
    id: string;
    site: string | undefined;
    sites: readonly AdminSite[];
}) {
    const [release, setRelease] = useState<ReleaseView | null | undefined>();
    const [adding, setAdding] = useState(false);
    const [scheduling, setScheduling] = useState(false);
    const [confirming, setConfirming] = useState<ReleaseConfirm | undefined>();
    const [problem, setProblem] = useState<string | undefined>();
    const [sending, setSending] = useState(false);
    const toasts = Toast.useToastManager();
    const load = useCallback(async () => {
        const answer = await connection.call<ReleaseView>('editing_releases_get', {
            params: {
                id,
            },
        });
        setRelease(answer.status === 200 ? answer.body : null);
    }, [connection, id]);
    useEffect(() => {
        void load();
    }, [load]);

    if (release === undefined) return null;
    if (release === null) {
        return (
            <>
                <PageHeader title="No such release" />
                <div className="k-admin__body">
                    <a className="k-button k-button--secondary" href={scheduledHref(site)}>
                        Go to Scheduled
                    </a>
                </div>
            </>
        );
    }

    const open = release.state !== 'published';
    // An agent's release waits on the person it asked, who sends it all back with one note.
    const waitingReview = release.documents.find((document) => document.review?.status === 'open')?.review ?? undefined;
    const sendBack = async (note: string): Promise<boolean> => {
        setProblem(undefined);
        setSending(true);
        const answer = await connection.call<ReleaseView>('editing_releases_send_back', {
            params: {
                id,
            },
            body: {
                note,
            },
        });
        setSending(false);
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'It was not sent back'));
            return false;
        }
        toasts.add({
            description: `Sent ${release.name} back.`,
        });
        setRelease(answer.body);
        return true;
    };
    const remove = async (ref: string): Promise<void> => {
        setProblem(undefined);
        const answer = await connection.call<ReleaseView>('editing_releases_remove', {
            params: {
                id,
            },
            body: {
                refs: [ref],
            },
        });
        if (answer.status !== 200) {
            setProblem(problemOf(answer, 'It was not taken out'));
            return;
        }
        setRelease(answer.body);
    };
    const confirmations: Record<ReleaseConfirm, Confirmation> = {
        publish: {
            label: 'Publish now',
            question: `Publish ${release.name} now? ${release.documents.length === 1 ? 'Its document goes' : `Its ${release.documents.length} documents go`} live together.`,
        },
        unschedule: {
            label: 'Take back the time',
            question: `Take back the time of ${release.name}? It stays, and nothing publishes until someone schedules or publishes it.`,
        },
        delete: {
            label: 'Delete',
            question: `Delete ${release.name}? Its drafts stay as they are.`,
        },
    };
    const run = async (kind: ReleaseConfirm): Promise<void> => {
        setConfirming(undefined);
        setProblem(undefined);
        // The person confirmed in the dialog, so the route runs without asking again.
        const answer =
            kind === 'publish'
                ? await connection.call<ReleaseView>(
                      'editing_releases_publish',
                      {
                          params: {
                              id,
                          },
                          body: {},
                      },
                      {
                          approved: true,
                      }
                  )
                : await connection.call<ReleaseView>(kind === 'unschedule' ? 'editing_releases_unschedule' : 'editing_releases_delete', {
                      params: {
                          id,
                      },
                  });
        if (answer.status >= 300) {
            setProblem(
                problemOf(
                    answer,
                    kind === 'publish' ? 'It was not published' : kind === 'delete' ? 'It was not deleted' : 'The time stayed'
                )
            );
            return;
        }
        if (kind === 'delete') {
            toasts.add({
                description: `Deleted ${release.name}.`,
            });
            navigate(scheduledHref(site));
            return;
        }
        if (kind === 'publish') {
            toasts.add({
                description: `Published ${release.name}.`,
            });
        }
        setRelease(answer.body as ReleaseView);
    };

    const groups = [
        ...sites
            .map((candidate) => ({
                key: candidate.key,
                label: candidate.label,
                site: candidate as AdminSite | undefined,
                documents: release.documents.filter((document) => document.site === candidate.key),
            }))
            .sort((first, second) => Number(second.key === site) - Number(first.key === site)),
        {
            key: '',
            label: sites.length === 0 ? '' : SHARED_GROUP,
            site: undefined,
            documents: release.documents.filter(
                (document) => document.site === null || !sites.some((candidate) => candidate.key === document.site)
            ),
        },
    ].filter((group) => group.documents.length > 0);

    const status =
        release.state === 'published'
            ? release.publishedAt === null
                ? 'Published'
                : `Published ${whenOf(release.publishedAt)}`
            : release.at === null
              ? 'Not scheduled'
              : release.state === 'held'
                ? `Held since ${whenOf(release.at)}`
                : `Publishes ${whenOf(release.at)}`;

    return (
        <>
            <PageHeader
                crumbs={[
                    {
                        label: 'Scheduled',
                        href: scheduledHref(site),
                    },
                ]}
                title={release.name}
                meta={[
                    {
                        label: 'Status',
                        value: status,
                    },
                    release.waiting === 0 || !open
                        ? null
                        : {
                              label: 'Waiting on',
                              value: release.waiting === 1 ? '1 document' : `${release.waiting} documents`,
                          },
                    {
                        label: 'Made by',
                        value: peopleLine('', release.createdBy, release.createdVia == null ? '' : ` via ${release.createdVia}`),
                    },
                ]}
                actions={
                    open ? (
                        <>
                            {waitingReview === undefined ? null : <SendBack review={waitingReview} busy={sending} onSend={sendBack} />}
                            <button type="button" className="k-button k-button--secondary k-button--small" onClick={() => setAdding(true)}>
                                <Plus {...ICON} />
                                Add documents
                            </button>
                            {release.mayPublish ? (
                                <>
                                    <button
                                        type="button"
                                        className="k-button k-button--secondary k-button--small"
                                        disabled={release.documents.length === 0}
                                        onClick={() => setConfirming('publish')}>
                                        Publish now
                                    </button>
                                    <button
                                        type="button"
                                        className="k-button k-button--primary"
                                        disabled={release.documents.length === 0}
                                        onClick={() => setScheduling(true)}>
                                        {release.at === null ? (
                                            'Schedule'
                                        ) : (
                                            <>
                                                <CalendarClock {...ICON} />
                                                {`${dayOf(release.at)}, ${clockOf(release.at).split(' ')[0]}`}
                                            </>
                                        )}
                                    </button>
                                </>
                            ) : null}
                            <Menu.Root>
                                <Menu.Trigger
                                    className="k-button k-button--secondary k-button--small k-button--icon"
                                    aria-label="More actions">
                                    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                                        <circle cx="5" cy="12" r="1.6" fill="currentColor" />
                                        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
                                        <circle cx="19" cy="12" r="1.6" fill="currentColor" />
                                    </svg>
                                </Menu.Trigger>
                                <Menu.Portal>
                                    <Menu.Positioner sideOffset={6} align="end" className="k-positioner">
                                        <Menu.Popup className="k-popup k-menu k-document-menu">
                                            {release.at === null ? null : (
                                                <Menu.Item className="k-menu__item" onClick={() => setConfirming('unschedule')}>
                                                    Take back the time
                                                </Menu.Item>
                                            )}
                                            <Menu.Item className="k-menu__item" onClick={() => setConfirming('delete')}>
                                                Delete release
                                            </Menu.Item>
                                        </Menu.Popup>
                                    </Menu.Positioner>
                                </Menu.Portal>
                            </Menu.Root>
                        </>
                    ) : null
                }
            />
            <div className="k-admin__body k-scheduled">
                {problem === undefined ? null : (
                    <p className="k-error" role="alert">
                        <CircleAlert {...ICON} />
                        {problem}
                    </p>
                )}
                {groups.length === 0 ? (
                    <div className="k-list-results__empty">
                        <h2 className="k-list-results__empty-title">No documents yet</h2>
                    </div>
                ) : (
                    groups.map((group) => (
                        <section key={group.key} className="k-scheduled__day">
                            {group.label === '' ? null : (
                                <h2 className="k-scheduled__day-title k-scheduled__site">
                                    <SiteIcon site={group.site} />
                                    {group.label}
                                </h2>
                            )}
                            <div className="k-scheduled__rows">
                                {group.documents.map((document) => {
                                    const Icon = iconOf(document.ref);
                                    const state = open ? releaseDocumentStateOf(document) : said('Published', true);
                                    return (
                                        <div key={document.ref} className="k-scheduled__row k-scheduled__row--document">
                                            <Icon {...ICON} className="k-scheduled__icon" />
                                            <a className="k-scheduled__title" href={documentHref(document.ref)}>
                                                <span className="k-ellipsis">{document.title}</span>
                                                <span className="k-scheduled__detail k-ellipsis">{document.kind}</span>
                                            </a>
                                            <span className="k-scheduled__state" data-quiet={state.quiet ? '' : undefined}>
                                                {state.text}
                                            </span>
                                            {open ? (
                                                <button
                                                    type="button"
                                                    className="k-icon-button"
                                                    aria-label={`Take ${document.title} out`}
                                                    onClick={() => void remove(document.ref)}>
                                                    <X {...ICON} />
                                                </button>
                                            ) : (
                                                <span />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ))
                )}
            </div>
            <AddDocumentsDialog
                connection={connection}
                release={release}
                site={site}
                open={adding}
                onOpenChange={setAdding}
                onAdded={setRelease}
            />
            <ScheduleReleaseDialog
                connection={connection}
                release={release}
                open={scheduling}
                onOpenChange={setScheduling}
                onScheduled={setRelease}
            />
            <ConfirmDialog
                confirming={confirming === undefined ? undefined : confirmations[confirming]}
                onConfirm={() => {
                    if (confirming !== undefined) void run(confirming);
                }}
                onCancel={() => setConfirming(undefined)}
            />
        </>
    );
}

/**
 * Puts the open document in a release: one of the open releases, or a new
 * one named here.
 */
export function AddToReleaseDialog({
    connection,
    documentRef,
    title,
    open,
    onOpenChange,
    onAdded,
}: {
    connection: Connection;
    documentRef: string;
    title: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAdded: (release: ReleaseView) => void;
}) {
    const [releases, setReleases] = useState<ReleaseView[] | undefined>();
    const [name, setName] = useState('');
    const [problem, setProblem] = useState<string | undefined>();
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (!open) return;
        setReleases(undefined);
        setName('');
        setProblem(undefined);
        void connection
            .call<{ releases: ReleaseView[] }>('editing_schedules_list')
            .then((answer) =>
                setReleases(answer.status === 200 ? answer.body.releases.filter((release) => release.state !== 'published') : [])
            );
    }, [open, connection]);
    const finish = (answer: { status: number; body: unknown }, expected: number): void => {
        setBusy(false);
        if (answer.status !== expected) {
            setProblem(problemOf(answer, 'It was not added'));
            return;
        }
        onAdded(answer.body as ReleaseView);
        onOpenChange(false);
    };
    const addTo = async (id: string): Promise<void> => {
        setBusy(true);
        finish(
            await connection.call('editing_releases_add', {
                params: {
                    id,
                },
                body: {
                    refs: [documentRef],
                },
            }),
            200
        );
    };
    const create = async (): Promise<void> => {
        setBusy(true);
        finish(
            await connection.call('editing_releases_create', {
                body: {
                    name: name.trim(),
                    refs: [documentRef],
                },
            }),
            201
        );
    };
    return (
        <Dialog.Root open={open} onOpenChange={onOpenChange}>
            <Dialog.Portal>
                <Dialog.Backdrop className="k-backdrop" />
                <Dialog.Popup className="k-dialog k-release-dialog">
                    <div className="k-dialog__head">
                        <Dialog.Title className="k-dialog__title">Add {title} to a release</Dialog.Title>
                        <Dialog.Close className="k-icon-button k-dialog__close" aria-label="Close">
                            <X {...ICON} />
                        </Dialog.Close>
                    </div>
                    <div className="k-release-dialog__body">
                        {releases === undefined || releases.length === 0 ? null : (
                            <div className="k-release-dialog__list">
                                {releases.map((release) => (
                                    <button
                                        key={release.id}
                                        type="button"
                                        className="k-release-dialog__row k-release-dialog__choice"
                                        disabled={busy}
                                        onClick={() => void addTo(release.id)}>
                                        <Layers {...ICON} className="k-scheduled__icon" />
                                        <span className="k-scheduled__title">
                                            <span className="k-ellipsis">{release.name}</span>
                                        </span>
                                        <span className="k-scheduled__detail">{release.at === null ? '' : dayOf(release.at)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <form
                            className="k-release-dialog__new"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (name.trim() !== '') void create();
                            }}>
                            <input
                                className="k-input"
                                value={name}
                                placeholder="New release"
                                aria-label="New release"
                                maxLength={80}
                                onChange={(event) => setName(event.target.value)}
                            />
                            <button type="submit" className="k-button k-button--secondary" disabled={busy || name.trim() === ''}>
                                Create
                            </button>
                        </form>
                        {problem === undefined ? null : (
                            <p className="k-error" role="alert">
                                <CircleAlert {...ICON} />
                                {problem}
                            </p>
                        )}
                    </div>
                </Dialog.Popup>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
