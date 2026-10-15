'use client';

import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock, FileText, Globe, Library, Lock, Search } from 'lucide-react';
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

interface Shown {
    site: Site;
    page: string;
}

interface Document {
    id: string;
    label: string;
    site: Site;
    collection?: string;
    fields: Field[];
    published: Record<string, string>;
    shows: Shown[];
}

const productShows: Shown[] = [
    {
        site: 'Group',
        page: 'Products',
    },
    {
        site: 'United Kingdom',
        page: 'Products',
    },
    {
        site: 'Norway',
        page: 'Produkter',
    },
];

const product = (id: string, name: string, summary: string): Document => ({
    id,
    label: name,
    site: 'Group',
    collection: 'Products',
    fields: [
        {
            name: 'name',
            label: 'Name',
        },
        {
            name: 'summary',
            label: 'Summary',
        },
    ],
    published: {
        name,
        summary,
    },
    shows: productShows,
});

const page = (id: string, site: Site, name: string, heading: string): Document => ({
    id,
    label: name,
    site,
    collection: 'Pages',
    fields: [
        {
            name: 'heading',
            label: 'Heading',
        },
    ],
    published: {
        heading,
    },
    shows: [
        {
            site,
            page: name,
        },
    ],
});

const office = (id: string, name: string, address: string, phone: string): Document => ({
    id,
    label: name,
    site: 'United Kingdom',
    collection: 'Offices',
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
        address,
        phone,
    },
    shows: [
        {
            site: 'United Kingdom',
            page: 'Contact',
        },
    ],
});

const documents: Document[] = [
    {
        id: 'privacy',
        label: 'Privacy Policy',
        site: 'Group',
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
    product('air-8', 'Air to Water 8 kW', 'Heats a house up to 150 m².'),
    product('air-12', 'Air to Water 12 kW', 'Heats a house up to 250 m².'),
    product('air-air-6', 'Air to Air 6 kW', 'One indoor unit, for an open floor.'),
    product('ground-10', 'Ground Source 10 kW', 'Runs off a borehole or a ground loop.'),
    product('tank-200', 'Hot Water Tank 200 L', 'For a household of up to four.'),
    product('tank-300', 'Hot Water Tank 300 L', 'For a household of up to six.'),
    product('buffer-50', 'Buffer Tank 50 L', 'Evens out short runs.'),
    product('loop-kit', 'Ground Loop Kit', 'Pipe, manifold and fittings for 150 m.'),
    product('thermostat', 'Smart Thermostat', 'Sets the temperature room by room.'),
    product('bracket', 'Outdoor Bracket', 'Holds the outdoor unit off the ground.'),
    page('group-front', 'Group', 'Front Page', 'Heat pumps for northern homes'),
    page('group-about', 'Group', 'About', 'Forty years of keeping houses warm'),
    page('uk-front', 'United Kingdom', 'Front Page', 'Heat pumps, fitted in a day'),
    page('uk-contact', 'United Kingdom', 'Contact', 'Find your nearest office'),
    office('harbour', 'Harbour Office', '12 Harbour Street', '+44 20 0000 0100'),
    office('station', 'Station Office', '3 Station Road', '+44 20 0000 0200'),
    page('norway-front', 'Norway', 'Front Page', 'Varmepumpe, montert på en dag'),
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
const sites: Site[] = ['Group', 'United Kingdom', 'Norway'];

interface Draft {
    values: Record<string, string>;
    published: Record<string, string>;
    review: boolean;
}

type Open =
    | {
          kind: 'document';
          id: string;
      }
    | {
          kind: 'collection';
          site: Site;
          name: string;
      };

type Refresh = Array<{
    site: Site;
    state: 'refreshing' | 'retrying' | 'refreshed';
}>;

const changed = (draft: Draft) => Object.keys(draft.values).some((name) => draft.values[name] !== draft.published[name]);

const statusOf = (draft: Draft) => (draft.review ? 'Waiting for review' : changed(draft) ? 'Unpublished changes' : 'Published');

const canPublish = (person: Person, site: Site) => person === 'admin' || site !== 'Group';

const listed = (person: Person, site: Site) => site === 'Group' || people[person].sites.includes(site);

const listsOf = (site: Site) => [
    ...new Set(documents.flatMap((document) => (document.site === site && document.collection !== undefined ? [document.collection] : []))),
];

/**
 * The editor, small and clickable: two people, three sites, and one change
 * taken from a draft to every site that shows it.
 */
export function EditingDemo() {
    const [person, setPerson] = useState<Person>('sam');
    const [open, setOpen] = useState<Open>({
        kind: 'document',
        id: 'privacy',
    });
    const [query, setQuery] = useState('');
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
                              state: entry.state === 'refreshing' && entry.site === 'Norway' ? 'retrying' : 'refreshed',
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

    const openDocument = (id: string) =>
        setOpen({
            kind: 'document',
            id,
        });

    const openCollection = (site: Site, name: string) => {
        setQuery('');
        setOpen({
            kind: 'collection',
            site,
            name,
        });
    };

    const openSite = open.kind === 'collection' ? open.site : (documents.find((candidate) => candidate.id === open.id)?.site ?? 'Group');

    const switchTo = (next: Person) => {
        setPerson(next);
        if (!listed(next, openSite)) openDocument('privacy');
    };

    const waiting = (document: Document) => person === 'admin' && drafts[document.id].review;

    const listEntry = (site: Site) => (name: string) => {
        const items = documents.filter((candidate) => candidate.site === site && candidate.collection === name);
        const current =
            (open.kind === 'collection' && open.site === site && open.name === name) ||
            (open.kind === 'document' && items.some((item) => item.id === open.id));
        const Icon = name === 'Pages' ? FileText : Library;
        return (
            <button
                key={name}
                type="button"
                className={clsx(styles.entry, current && styles.entryOpen)}
                onClick={() => openCollection(site, name)}>
                <Icon aria-hidden />
                <span className={styles.entryLabel}>{name}</span>
                {items.some(waiting) ? <span className={styles.dot} aria-label="Waiting for your review" /> : null}
                <span className={styles.count}>{items.length}</span>
            </button>
        );
    };

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
                                {listsOf(site)
                                    .filter((name) => name === 'Pages')
                                    .map(listEntry(site))}
                                {documents
                                    .filter((candidate) => candidate.site === site && candidate.collection === undefined)
                                    .map((candidate) => (
                                        <button
                                            key={candidate.id}
                                            type="button"
                                            className={clsx(
                                                styles.entry,
                                                open.kind === 'document' && open.id === candidate.id && styles.entryOpen
                                            )}
                                            onClick={() => openDocument(candidate.id)}>
                                            <Globe aria-hidden />
                                            <span className={styles.entryLabel}>{candidate.label}</span>
                                            {waiting(candidate) ? (
                                                <span className={styles.dot} aria-label="Waiting for your review" />
                                            ) : null}
                                        </button>
                                    ))}
                                {listsOf(site)
                                    .filter((name) => name !== 'Pages')
                                    .map(listEntry(site))}
                            </div>
                        ))}
                </nav>

                {open.kind === 'collection' ? (
                    <CollectionList
                        site={open.site}
                        name={open.name}
                        query={query}
                        onQuery={setQuery}
                        items={documents.filter((candidate) => candidate.site === open.site && candidate.collection === open.name)}
                        drafts={drafts}
                        waiting={waiting}
                        onOpen={openDocument}
                    />
                ) : (
                    <DocumentForm
                        person={person}
                        document={documents.find((candidate) => candidate.id === open.id) ?? documents[0]}
                        draft={drafts[open.id]}
                        refresh={refresh?.id === open.id ? refresh.sites : undefined}
                        onBack={(document) => {
                            if (document.collection !== undefined) openCollection(document.site, document.collection);
                        }}
                        onChange={(document, next) => {
                            setRefresh(undefined);
                            update(document.id, next);
                        }}
                        onPublish={(document) => {
                            update(document.id, {
                                published: {
                                    ...drafts[document.id].values,
                                },
                                review: false,
                            });
                            setRefresh({
                                id: document.id,
                                sites: [...new Set(document.shows.map((entry) => entry.site))].map((site) => ({
                                    site,
                                    state: 'refreshing',
                                })),
                            });
                        }}
                        onSignInAsAdmin={() => switchTo('admin')}
                    />
                )}
            </div>
        </div>
    );
}

interface CollectionListProps {
    site: Site;
    name: string;
    query: string;
    onQuery: (query: string) => void;
    items: Document[];
    drafts: Record<string, Draft>;
    waiting: (document: Document) => boolean;
    onOpen: (id: string) => void;
}

function CollectionList({ site, name, query, onQuery, items, drafts, waiting, onOpen }: CollectionListProps) {
    const shown = items.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()));

    return (
        <div className={styles.form}>
            <div className={styles.header}>
                <Logo className={styles.logo} aria-hidden />
                <span className={styles.title}>{name}</span>
                <span className={styles.status}>{items.length}</span>
            </div>
            <div className={styles.owner}>
                <span className={styles.muted}>Owned by</span>
                <span className={styles.chip}>
                    <Globe aria-hidden />
                    {site}
                </span>
            </div>
            <input
                className={styles.input}
                type="search"
                placeholder={`Find in ${name.toLowerCase()}`}
                aria-label={`Find in ${name.toLowerCase()}`}
                value={query}
                onChange={(event) => onQuery(event.target.value)}
            />
            <div className={styles.items}>
                {shown.map((item) => (
                    <button key={item.id} type="button" className={styles.item} onClick={() => onOpen(item.id)}>
                        <span className={styles.entryLabel}>{item.label}</span>
                        {waiting(item) ? <span className={styles.dot} aria-label="Waiting for your review" /> : null}
                        <span className={styles.muted}>{statusOf(drafts[item.id])}</span>
                        <ChevronRight aria-hidden />
                    </button>
                ))}
                {shown.length === 0 ? <p className={styles.empty}>Nothing matches.</p> : null}
            </div>
        </div>
    );
}

interface DocumentFormProps {
    person: Person;
    document: Document;
    draft: Draft;
    refresh: Refresh | undefined;
    onBack: (document: Document) => void;
    onChange: (document: Document, next: Partial<Draft>) => void;
    onPublish: (document: Document) => void;
    onSignInAsAdmin: () => void;
}

function DocumentForm({ person, document, draft, refresh, onBack, onChange, onPublish, onSignInAsAdmin }: DocumentFormProps) {
    const publishes = canPublish(person, document.site);
    const reviewing = person === 'admin' && draft.review;
    const status = statusOf(draft);

    return (
        <div className={styles.form}>
            <div className={styles.header}>
                <Logo className={styles.logo} aria-hidden />
                <span className={styles.title}>
                    {document.collection === undefined ? null : (
                        <>
                            <button type="button" className={styles.crumb} onClick={() => onBack(document)}>
                                {document.collection}
                            </button>
                            <span className={styles.muted}> / </span>
                        </>
                    )}
                    {document.label}
                </span>
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
                            className={clsx(styles.input, draft.values[field.name] !== draft.published[field.name] && styles.inputChanged)}
                            value={draft.values[field.name]}
                            readOnly={draft.review && person === 'sam'}
                            onChange={(event) =>
                                onChange(document, {
                                    values: {
                                        ...draft.values,
                                        [field.name]: event.target.value,
                                    },
                                })
                            }
                        />
                    </label>
                ))}
            </div>

            {refresh === undefined ? null : (
                <div className={styles.refresh}>
                    {refresh.map((entry) => (
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
            )}

            <div className={styles.footer}>
                {reviewing ? (
                    <>
                        <button
                            type="button"
                            className={clsx(styles.button, styles.secondary)}
                            onClick={() =>
                                onChange(document, {
                                    review: false,
                                })
                            }>
                            Request changes
                        </button>
                        <button type="button" className={clsx(styles.button, styles.primary)} onClick={() => onPublish(document)}>
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
                            onClick={() => onPublish(document)}>
                            Publish
                        </button>
                    </>
                ) : draft.review ? (
                    <>
                        <span className={styles.muted}>Sent to the group's admins.</span>
                        <button type="button" className={clsx(styles.button, styles.secondary)} onClick={onSignInAsAdmin}>
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
                                onChange(document, {
                                    review: true,
                                })
                            }>
                            Ask for review
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
