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

interface Group {
    title: string;
    note?: string;
    entries: Entry[];
}

const icons = {
    page: FileText,
    collection: Library,
    global: Globe,
};

const shared: Group = {
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

const uk: Group = {
    title: 'Example UK',
    entries: [
        {
            label: 'Front Page',
            icon: 'page',
        },
        {
            label: 'Events',
            icon: 'collection',
        },
        {
            label: 'Contact',
            icon: 'page',
        },
    ],
};

const norway: Group = {
    title: 'Example Norge',
    entries: [
        {
            label: 'Front Page',
            icon: 'page',
        },
        {
            label: 'Articles',
            icon: 'collection',
        },
    ],
};

/**
 * What the editor's switcher lists: an admin of the group sees every site,
 * a country's editor sees their own and the shared content.
 */
export function Switcher({ as }: { as: 'admin' | 'country' }) {
    const groups: Group[] =
        as === 'admin'
            ? [shared, uk, norway]
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
            {groups.map((group) => (
                <div key={group.title} className={styles.group}>
                    <div className={styles.groupTitle}>
                        <span>{group.title}</span>
                        {group.note === undefined ? null : (
                            <span className={clsx(styles.chip, styles.note)}>
                                <Lock aria-hidden />
                                {group.note}
                            </span>
                        )}
                    </div>
                    {group.entries.map((entry) => {
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
            {as === 'country' ? <p className={styles.footnote}>Example Norge and the other sites are not listed.</p> : null}
        </Editor>
    );
}

function Whose({ children, own = false }: { children: ReactNode; own?: boolean }) {
    return (
        <span className={clsx(styles.chip, styles.whose, own && styles.chipYou)}>
            {own ? <FileText aria-hidden /> : <Globe aria-hidden />}
            {children}
        </span>
    );
}

/**
 * The group's admin beside a country's editor, so the difference is one look.
 */
export function Switchers() {
    return (
        <div className={styles.pair}>
            <div className={styles.column}>
                <span className={styles.who}>The group's admin</span>
                <Switcher as="admin" />
            </div>
            <div className={styles.column}>
                <span className={styles.who}>Sam, editor of Example UK</span>
                <Switcher as="country" />
            </div>
        </div>
    );
}

/**
 * A country's editor on a shared office: they draft the phone number, add
 * their own opening hours, and ask for a review instead of publishing.
 */
export function SharedItem() {
    return (
        <Shell title="Harbour Office" status="Unpublished changes" saved>
            <div className={styles.banner}>
                <span className={styles.bannerLabel}>Shared by</span>
                {['Example Group', 'Example UK', 'Example Norge', 'Example Danmark'].map((site) => (
                    <span key={site} className={clsx(styles.chip, site === 'Example UK' && styles.chipYou)}>
                        <Globe aria-hidden />
                        {site}
                    </span>
                ))}
            </div>
            <FormSection>
                <Row label="Address">
                    <TextInput value="12 Harbour Street" />
                    <Whose>Shared</Whose>
                </Row>
                <Row label="Phone">
                    <TextInput value="+44 1224 000 111" mark="changed" />
                    <Whose>Shared, your draft</Whose>
                </Row>
                <Row label="Opening hours">
                    <TextInput value="Mon to Fri, 08:00 to 16:00" />
                    <Whose own>Example UK's own</Whose>
                </Row>
            </FormSection>
            <Footer>
                <Help>Opening hours publish now. Phone waits for an admin.</Help>
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
            <p className={editor.dialogTitle}>Publish Harbour Office?</p>
            <p className={styles.muted}>Sam from Example UK asked you to review this.</p>
            <div className={styles.diff}>
                <span className={styles.diffLabel}>Phone</span>
                <span>
                    <del>+44 1224 000 000</del> <ins>+44 1224 000 111</ins>
                </span>
            </div>
            <div className={styles.reachList}>
                <span className={styles.bannerLabel}>Shows on</span>
                {[
                    {
                        site: 'Example Group',
                        pages: ['Contact', 'About Us'],
                    },
                    {
                        site: 'Example UK',
                        pages: ['Contact', 'Front Page', 'Events'],
                    },
                    {
                        site: 'Example Norge',
                        pages: ['Contact', 'Kontor'],
                    },
                    {
                        site: 'Example Danmark',
                        pages: ['Kontakt', 'Forside'],
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
        site: 'Example Group',
        ok: true,
    },
    {
        site: 'Example UK',
        ok: true,
    },
    {
        site: 'Example Norge',
        ok: true,
    },
    {
        site: 'Example Danmark',
        ok: false,
    },
];

/**
 * After publishing a shared item, each site that shows it is refreshed.
 */
export function FanOut() {
    return (
        <Editor className={editor.dialog}>
            <p className={editor.dialogTitle}>Published Harbour Office</p>
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
