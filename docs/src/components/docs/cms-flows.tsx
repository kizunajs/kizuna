import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Check, Clock, FileText, Globe, Library, Lock, Search } from 'lucide-react';
import { Button, Editor, Footer, FormSection, Help, Row, Shell, TextInput } from '@/components/landing-page/cms/cms-editor-mock';
import editor from '@/components/landing-page/cms/cms-editor.module.css';
import styles from './cms-flows.module.css';

interface Entry {
    label: string;
    icon: 'page' | 'collection' | 'global';
    note?: string;
}

interface Heading {
    title: string;
    note?: string;
    entries: Entry[];
}

const icons = {
    page: FileText,
    collection: Library,
    global: Globe,
};

const shared: Heading = {
    title: 'Shared',
    entries: [
        {
            label: 'Employees',
            icon: 'collection',
        },
        {
            label: 'Offices',
            icon: 'collection',
        },
        {
            label: 'Privacy Policy',
            icon: 'global',
        },
    ],
};

const hagenGroup: Heading = {
    title: 'Hagen Group',
    entries: [
        {
            label: 'Front Page',
            icon: 'page',
        },
    ],
};

const uk: Heading = {
    title: 'Hagen UK',
    entries: [
        {
            label: 'Front Page',
            icon: 'page',
        },
        {
            label: 'Events',
            icon: 'collection',
        },
    ],
};

const norway: Heading = {
    title: 'Hagen Norge',
    entries: [
        {
            label: 'Front Page',
            icon: 'page',
        },
    ],
};

/**
 * What the editor's switcher lists: an admin over every site sees the shared
 * content and every site, a site's editor sees the shared content and their
 * own site.
 */
export function Switcher({ as }: { as: 'admin' | 'site' }) {
    const headings: Heading[] =
        as === 'admin'
            ? [shared, hagenGroup, uk, norway]
            : [
                  {
                      ...shared,
                      note: 'You draft, an admin publishes',
                  },
                  uk,
              ];

    return (
        <Editor className={styles.switcher}>
            <div className={editor.search}>
                <Search aria-hidden />
                <span className={styles.muted}>Find a page or an item</span>
            </div>
            {headings.map((heading) => (
                <div key={heading.title} className={styles.group}>
                    <div className={styles.groupTitle}>
                        <span>{heading.title}</span>
                        {heading.note === undefined ? null : (
                            <span className={clsx(styles.chip, styles.note)}>
                                <Lock aria-hidden />
                                {heading.note}
                            </span>
                        )}
                    </div>
                    {heading.entries.map((entry) => {
                        const Icon = icons[entry.icon];
                        return (
                            <div key={entry.label} className={styles.entry}>
                                <Icon aria-hidden />
                                {entry.label}
                            </div>
                        );
                    })}
                </div>
            ))}
            {as === 'site' ? <p className={styles.footnote}>Hagen Group and Hagen Norge are not listed.</p> : null}
        </Editor>
    );
}

/**
 * An admin over every site beside a site's editor, so the difference is one
 * look.
 */
export function Switchers() {
    return (
        <div className={styles.pair}>
            <div className={styles.column}>
                <span className={styles.who}>An admin over every site</span>
                <Switcher as="admin" />
            </div>
            <div className={styles.column}>
                <span className={styles.who}>Sam, Hagen UK's editor</span>
                <Switcher as="site" />
            </div>
        </div>
    );
}

/**
 * Hagen UK's values on a shared office: the UK's editor writes and publishes
 * them, and only the UK refreshes.
 */
export function OwnItem() {
    return (
        <Shell title="Harbour Office" status="Unpublished changes" saved>
            <div className={styles.banner}>
                <span className={styles.bannerLabel}>Site</span>
                <span className={styles.chip}>
                    <Globe aria-hidden />
                    Hagen UK
                </span>
            </div>
            <FormSection>
                <Row label="Phone">
                    <TextInput value="+44 20 0000 0111" mark="changed" />
                    <Help>Hagen UK. Clear it to show the shared number.</Help>
                </Row>
                <Row label="Opening hours">
                    <TextInput value="Mon to Fri, 08:00 to 16:00" />
                    <Help>Hagen UK</Help>
                </Row>
            </FormSection>
            <Footer>
                <span />
                <Button variant="primary">Publish</Button>
            </Footer>
        </Shell>
    );
}

/**
 * The shared Privacy Policy, as the UK's editor sees it: they draft, an admin
 * over every site publishes.
 */
export function SharedItem() {
    return (
        <Shell title="Privacy Policy" status="Unpublished changes" saved>
            <div className={styles.banner}>
                <span className={styles.chip}>
                    <Library aria-hidden />
                    Shared
                </span>
                <span className={styles.partNote}>
                    <Lock aria-hidden />
                    You draft, an admin publishes
                </span>
            </div>
            <FormSection>
                <Row label="Contact email">
                    <TextInput value="privacy@hagen.example.com" mark="changed" />
                </Row>
            </FormSection>
            <Footer>
                <span />
                <Button variant="primary">Ask for review</Button>
            </Footer>
        </Shell>
    );
}

/**
 * The admin's side of the same change: where it shows, and approving it.
 */
export function SharedReview() {
    return (
        <Editor className={editor.dialog}>
            <p className={editor.dialogTitle}>Publish Privacy Policy?</p>
            <p className={styles.muted}>Sam, Hagen UK's editor, asked you to review this.</p>
            <div className={styles.diff}>
                <span className={styles.diffLabel}>Contact email</span>
                <span>
                    <del>legal@hagen.example.com</del> <ins>privacy@hagen.example.com</ins>
                </span>
            </div>
            <div className={styles.reachList}>
                <span className={styles.bannerLabel}>Shows on</span>
                {[
                    {
                        site: 'Hagen Group',
                        pages: ['Privacy'],
                    },
                    {
                        site: 'Hagen UK',
                        pages: ['Privacy'],
                    },
                    {
                        site: 'Hagen Norge',
                        pages: ['Personvern'],
                    },
                ].map((entry) => (
                    <div key={entry.site} className={styles.reachRow}>
                        <span className={styles.reachSite}>
                            <Globe aria-hidden />
                            {entry.site}
                        </span>
                        <span className={styles.reachPages}>
                            {entry.pages.map((pageName) => (
                                <span key={pageName} className={styles.chip}>
                                    <FileText aria-hidden />
                                    {pageName}
                                </span>
                            ))}
                        </span>
                    </div>
                ))}
            </div>
            <Footer>
                <Button variant="secondary">Request changes</Button>
                <Button variant="primary">Approve and publish</Button>
            </Footer>
        </Editor>
    );
}

const refreshed = [
    {
        site: 'Hagen Group',
        ok: true,
    },
    {
        site: 'Hagen UK',
        ok: true,
    },
    {
        site: 'Hagen Norge',
        ok: false,
    },
    {
        site: 'Travel agency',
        ok: true,
    },
];

/**
 * After publishing a shared item, each site and partner that shows it is
 * refreshed.
 */
export function FanOut() {
    return (
        <Editor className={editor.dialog}>
            <p className={editor.dialogTitle}>Published Privacy Policy</p>
            <p className={styles.muted}>Refreshed 2 of 3 sites and 1 partner. Hagen Norge did not answer, retrying.</p>
            <div className={styles.sites}>
                {refreshed.map((entry) => (
                    <div key={entry.site} className={clsx(styles.site, !entry.ok && styles.waiting)}>
                        {entry.ok ? <Check aria-hidden /> : <Clock aria-hidden />}
                        <span>{entry.site}</span>
                        <span className={styles.muted}>{entry.ok ? 'Refreshed' : 'Did not answer, retrying'}</span>
                    </div>
                ))}
            </div>
        </Editor>
    );
}

/**
 * The search result field: what the page generates is the placeholder, and
 * what an editor types replaces it.
 */
export function SearchResult() {
    return (
        <Shell title="New Office, Same People" status="Unpublished changes">
            <FormSection>
                <Row label="Search title">
                    <div className={clsx(editor.input, editor.withCounter)}>
                        <span className={styles.placeholderText}>New Office, Same People</span>
                        <span className={editor.counter}>34/60</span>
                    </div>
                    <Help>From the title. The site adds "| Acme Blog". Type to write your own.</Help>
                </Row>
                <Row label="Description">
                    <TextInput
                        value="We have moved to 12 Harbour Street. Same team, same phone number, a better view."
                        max={160}
                        mark="changed"
                    />
                    <Help>Written by Sam. Clear it to use the summary again.</Help>
                </Row>
            </FormSection>
            <div className={styles.result}>
                <span className={styles.muted}>example.com › blog › new-office</span>
                <span className={styles.resultTitle}>New Office, Same People | Acme Blog</span>
                <span className={styles.muted}>We have moved to 12 Harbour Street. Same team, same phone number, a better view.</span>
            </div>
        </Shell>
    );
}
