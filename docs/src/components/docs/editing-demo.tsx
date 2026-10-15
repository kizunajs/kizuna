'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Check, Clock, FileText, Globe, Library, Lock, Search } from 'lucide-react';
import Logo from '@/icons/Logo.svg';
import editor from '@/components/landing-page/cms/cms-editor.module.css';
import panel from '@/components/landing-page/panel.module.css';
import styles from './editing-demo.module.css';

type Person = 'admin' | 'sam';
type Site = 'Group' | 'United Kingdom' | 'Norway';

interface Field {
    name: string;
    label: string;
}

interface Document {
    id: string;
    label: string;
    site: Site;
    collection?: string;
    icon: 'page' | 'collection' | 'global';
    fields: Field[];
    published: Record<string, string>;
    shows: Array<{
        site: Site;
        page: string;
    }>;
}

const documents: Document[] = [
    {
        id: 'privacy',
        label: 'Privacy Policy',
        site: 'Group',
        icon: 'global',
        fields: [
            {
                name: 'email',
                label: 'Contact email',
            },
            {
                name: 'retention',
                label: 'Kept for',
            },
        ],
        published: {
            email: 'legal@acme.com',
            retention: 'Two years after your last order',
        },
        shows: [
            {
                site: 'Group',
                page: 'Privacy',
            },
            {
                site: 'United Kingdom',
                page: 'Privacy',
            },
            {
                site: 'Norway',
                page: 'Personvern',
            },
        ],
    },
    {
        id: 'uk-front',
        label: 'Front Page',
        site: 'United Kingdom',
        icon: 'page',
        fields: [
            {
                name: 'heading',
                label: 'Heading',
            },
        ],
        published: {
            heading: 'Heat pumps, fitted in a day',
        },
        shows: [
            {
                site: 'United Kingdom',
                page: 'Front Page',
            },
        ],
    },
    {
        id: 'harbour',
        label: 'Harbour Office',
        site: 'United Kingdom',
        collection: 'Offices',
        icon: 'collection',
        fields: [
            {
                name: 'address',
                label: 'Address',
            },
            {
                name: 'phone',
                label: 'Phone',
            },
        ],
        published: {
            address: '12 Harbour Street',
            phone: '+44 20 0000 0100',
        },
        shows: [
            {
                site: 'United Kingdom',
                page: 'Contact',
            },
            {
                site: 'United Kingdom',
                page: 'Front Page',
            },
        ],
    },
    {
        id: 'norway-front',
        label: 'Front Page',
        site: 'Norway',
        icon: 'page',
        fields: [
            {
                name: 'heading',
                label: 'Heading',
            },
        ],
        published: {
            heading: 'Varmepumpe, montert på en dag',
        },
        shows: [
            {
                site: 'Norway',
                page: 'Front Page',
            },
        ],
    },
];

const people: Record<Person, { name: string; sites: Site[] }> = {
    admin: {
        name: 'Kim, group admin',
        sites: ['Group', 'United Kingdom', 'Norway'],
    },
    sam: {
        name: 'Sam, UK admin',
        sites: ['United Kingdom'],
    },
};

const signIns: Person[] = ['sam', 'admin'];

const icons = {
    page: FileText,
    collection: Library,
    global: Globe,
};

interface Draft {
    values: Record<string, string>;
    published: Record<string, string>;
    review: boolean;
}

type Refresh = Array<{
    site: Site;
    state: 'refreshing' | 'retrying' | 'refreshed';
}>;

const changed = (draft: Draft) => Object.keys(draft.values).some((name) => draft.values[name] !== draft.published[name]);

const canPublish = (person: Person, document: Document) => person === 'admin' || document.site !== 'Group';

const listed = (person: Person, site: Site) => site === 'Group' || people[person].sites.includes(site);

/**
 * The editor, small and clickable: two people, three sites, and one change
 * taken from a draft to every site that shows it.
 */
export function EditingDemo() {
    const [person, setPerson] = useState<Person>('sam');
    const [openId, setOpenId] = useState('privacy');
    const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
        Object.fromEntries(
            documents.map((document) => [
                document.id,
                {
                    values: {
                        ...document.published,
                    },
                    published: document.published,
                    review: false,
                },
            ])
        )
    );
    const [refresh, setRefresh] = useState<{ id: string; sites: Refresh } | undefined>();

    const document = documents.find((candidate) => candidate.id === openId) ?? documents[0];
    const draft = drafts[document.id];
    const publishes = canPublish(person, document);
    const reviewing = person === 'admin' && draft.review;

    useEffect(() => {
        if (refresh === undefined || refresh.sites.every((entry) => entry.state === 'refreshed')) return;
        const timer = setTimeout(() => {
            setRefresh((current) =>
                current === undefined
                    ? current
                    : {
                          ...current,
                          sites: current.sites.map((entry) => ({
                              ...entry,
                              state: entry.state === 'refreshing' ? (entry.site === 'Norway' ? 'retrying' : 'refreshed') : 'refreshed',
                          })),
                      }
            );
        }, 1100);
        return () => clearTimeout(timer);
    }, [refresh]);

    const update = (id: string, next: Partial<Draft>) =>
        setDrafts((current) => ({
            ...current,
            [id]: {
                ...current[id],
                ...next,
            },
        }));

    const switchTo = (next: Person) => {
        setPerson(next);
        if (!listed(next, document.site)) setOpenId('privacy');
    };

    const publish = () => {
        update(document.id, {
            published: {
                ...draft.values,
            },
            review: false,
        });
        const sites = [...new Set(document.shows.map((entry) => entry.site))];
        setRefresh({
            id: document.id,
            sites: sites.map((site) => ({
                site,
                state: 'refreshing',
            })),
        });
    };

    const status = draft.review ? 'Waiting for review' : changed(draft) ? 'Unpublished changes' : 'Published';
    const sites: Site[] = ['Group', 'United Kingdom', 'Norway'];

    return (
        <div className={clsx(panel.panel, styles.demo)}>
            <div className={styles.people} role="tablist" aria-label="Signed in as">
                {signIns.map((candidate) => (
                    <button
                        key={candidate}
                        type="button"
                        role="tab"
                        aria-selected={person === candidate}
                        className={clsx(panel.tab, person === candidate && panel.tabActive, styles.person)}
                        onClick={() => switchTo(candidate)}>
                        {people[candidate].name}
                    </button>
                ))}
            </div>
            <div className={clsx(editor.editor, styles.window)}>
                <nav className={styles.switcher} aria-label="Content">
                    <div className={styles.search}>
                        <Search aria-hidden />
                        Find
                    </div>
                    {sites
                        .filter((site) => listed(person, site))
                        .map((site) => (
                            <div key={site} className={styles.group}>
                                <span className={styles.groupTitle}>{site}</span>
                                {documents
                                    .filter((candidate) => candidate.site === site)
                                    .map((candidate) => {
                                        const Icon = icons[candidate.icon];
                                        const waiting = person === 'admin' && drafts[candidate.id].review;
                                        return (
                                            <button
                                                key={candidate.id}
                                                type="button"
                                                className={clsx(styles.entry, candidate.id === document.id && styles.entryOpen)}
                                                onClick={() => setOpenId(candidate.id)}>
                                                <Icon aria-hidden />
                                                <span className={styles.entryLabel}>
                                                    {candidate.collection === undefined ? null : (
                                                        <span className={styles.collection}>{candidate.collection} / </span>
                                                    )}
                                                    {candidate.label}
                                                </span>
                                                {waiting ? <span className={styles.dot} aria-label="Waiting for your review" /> : null}
                                            </button>
                                        );
                                    })}
                            </div>
                        ))}
                    {person === 'sam' ? <p className={styles.footnote}>Norway is not listed.</p> : null}
                </nav>

                <div className={styles.form}>
                    <div className={styles.header}>
                        <Logo className={styles.logo} aria-hidden />
                        <span className={styles.title}>{document.label}</span>
                        <span className={clsx(styles.status, status === 'Published' && styles.statusPublished)}>{status}</span>
                    </div>

                    <div className={styles.owner}>
                        <span className={styles.muted}>Owned by</span>
                        <span className={styles.chip}>
                            <Globe aria-hidden />
                            {document.site}
                        </span>
                        {publishes ? null : (
                            <span className={styles.rule}>
                                <Lock aria-hidden />
                                You draft, an admin publishes
                            </span>
                        )}
                    </div>

                    {reviewing ? (
                        <div className={styles.review}>
                            <span className={styles.reviewTitle}>Sam asked you to review this</span>
                            {document.fields
                                .filter((field) => draft.values[field.name] !== draft.published[field.name])
                                .map((field) => (
                                    <div key={field.name} className={styles.diff}>
                                        <span className={styles.muted}>{field.label}</span>
                                        <span>
                                            <del>{draft.published[field.name]}</del> <ins>{draft.values[field.name]}</ins>
                                        </span>
                                    </div>
                                ))}
                            <div className={styles.shows}>
                                <span className={styles.muted}>Shows on</span>
                                {document.shows.map((entry) => (
                                    <span key={`${entry.site}${entry.page}`} className={styles.chip}>
                                        {entry.site}: {entry.page}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : null}

                    <div className={styles.fields}>
                        {document.fields.map((field) => (
                            <label key={field.name} className={styles.row}>
                                <span className={styles.label}>{field.label}</span>
                                <input
                                    className={clsx(
                                        styles.input,
                                        draft.values[field.name] !== draft.published[field.name] && styles.inputChanged
                                    )}
                                    value={draft.values[field.name]}
                                    readOnly={draft.review && person === 'sam'}
                                    onChange={(event) => {
                                        setRefresh(undefined);
                                        update(document.id, {
                                            values: {
                                                ...draft.values,
                                                [field.name]: event.target.value,
                                            },
                                        });
                                    }}
                                />
                            </label>
                        ))}
                    </div>

                    {refresh?.id === document.id ? (
                        <div className={styles.refresh}>
                            {refresh.sites.map((entry) => (
                                <span key={entry.site} className={clsx(styles.refreshRow, entry.state !== 'refreshed' && styles.muted)}>
                                    {entry.state === 'refreshed' ? <Check aria-hidden /> : <Clock aria-hidden />}
                                    {entry.site}
                                    <span className={styles.muted}>
                                        {entry.state === 'refreshed'
                                            ? 'Refreshed'
                                            : entry.state === 'retrying'
                                              ? 'Did not answer, retrying'
                                              : 'Refreshing'}
                                    </span>
                                </span>
                            ))}
                        </div>
                    ) : null}

                    <div className={styles.footer}>
                        {reviewing ? (
                            <>
                                <button
                                    type="button"
                                    className={clsx(styles.button, styles.secondary)}
                                    onClick={() =>
                                        update(document.id, {
                                            review: false,
                                        })
                                    }>
                                    Request changes
                                </button>
                                <button type="button" className={clsx(styles.button, styles.primary)} onClick={publish}>
                                    Approve and publish
                                </button>
                            </>
                        ) : publishes ? (
                            <>
                                <span />
                                <button
                                    type="button"
                                    className={clsx(styles.button, styles.primary)}
                                    disabled={!changed(draft)}
                                    onClick={publish}>
                                    Publish
                                </button>
                            </>
                        ) : draft.review ? (
                            <>
                                <span className={styles.muted}>Sent to the group's admins.</span>
                                <button type="button" className={clsx(styles.button, styles.secondary)} onClick={() => switchTo('admin')}>
                                    Sign in as Kim
                                </button>
                            </>
                        ) : (
                            <>
                                <span />
                                <button
                                    type="button"
                                    className={clsx(styles.button, styles.primary)}
                                    disabled={!changed(draft)}
                                    onClick={() =>
                                        update(document.id, {
                                            review: true,
                                        })
                                    }>
                                    Ask for review
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
