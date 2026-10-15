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
    title: 'Shared by every site',
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
            label: 'Privacy policy',
            icon: 'global',
        },
    ],
};

const uk: Group = {
    title: 'Example UK',
    entries: [
        {
            label: 'Front page',
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
            label: 'Front page',
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
                      note: 'Draft, an admin publishes',
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
                            <span className={styles.note}>
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

function Whose({ children }: { children: ReactNode }) {
    return <span className={styles.whose}>{children}</span>;
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
                <span className={styles.who}>Kari, editor of Example UK</span>
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
        <Shell title="Aberdeen office" status="Unpublished changes" saved>
            <div className={styles.banner}>Shared by 4 sites. Your changes to shared fields are a draft until an admin publishes them.</div>
            <FormSection>
                <Row label="Address">
                    <TextInput value="12 Union Street, Aberdeen" />
                    <Whose>Shared</Whose>
                </Row>
                <Row label="Phone">
                    <TextInput value="+44 1224 000 111" mark="changed" />
                    <Whose>Shared, your draft</Whose>
                </Row>
                <Row label="Opening hours">
                    <TextInput value="Mon to Fri, 08:00 to 16:00" />
                    <Whose>Example UK's own</Whose>
                </Row>
            </FormSection>
            <Footer>
                <Help>Opening hours publish now. The phone number waits for a review.</Help>
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
            <p className={editor.dialogTitle}>Publish Aberdeen office?</p>
            <p className={styles.muted}>Kari from Example UK asked you to review this.</p>
            <div className={styles.diff}>
                <span className={styles.diffLabel}>Phone</span>
                <span>
                    <del>+44 1224 000 000</del> <ins>+44 1224 000 111</ins>
                </span>
            </div>
            <p className={styles.reach}>Shows on 9 pages on 4 sites.</p>
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
            <p className={editor.dialogTitle}>Published Aberdeen office</p>
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
        <Shell title="New office, same people" status="Unpublished changes">
            <FormSection>
                <Row label="Search title">
                    <div className={clsx(editor.input, editor.withCounter)}>
                        <span className={styles.placeholderText}>New office, same people</span>
                        <span className={editor.counter}>34/60</span>
                    </div>
                    <Help>From the title. The site adds "| Acme Blog". Type to write your own.</Help>
                </Row>
                <Row label="Description">
                    <TextInput
                        value="We have moved to 12 Union Street. Same team, same phone number, a better view."
                        max={160}
                        mark="changed"
                    />
                    <Help>Written by Kari. Clear it to use the summary again.</Help>
                </Row>
            </FormSection>
            <div className={styles.result}>
                <span className={styles.muted}>example.com › blog › new-office</span>
                <span className={styles.resultTitle}>New office, same people | Acme Blog</span>
                <span className={styles.muted}>We have moved to 12 Union Street. Same team, same phone number, a better view.</span>
            </div>
        </Shell>
    );
}
