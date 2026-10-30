import clsx from 'clsx';
import type { ReactNode } from 'react';
import {
    Check,
    ChevronsUpDown,
    Clock,
    FileText,
    Flower2,
    Globe,
    Layers,
    Leaf,
    Library,
    Search,
    TreePine,
    Undo2,
    type LucideIcon,
} from 'lucide-react';
import { Button, Editor, Footer, FormSection, Help, Row, Shell, TextInput } from '@/components/landing-page/cms/cms-editor-mock';
import editor from '@/components/landing-page/cms/cms-editor.module.css';
import styles from './cms-flows.module.css';

interface Place {
    label: string;
    mark: LucideIcon;
}

const overview: Place = {
    label: 'Overview',
    mark: Layers,
};

const shared: Place = {
    label: 'Shared',
    mark: Library,
};

const hagenGroup: Place = {
    label: 'Hagen Group',
    mark: Leaf,
};

const uk: Place = {
    label: 'Hagen UK',
    mark: Flower2,
};

const norway: Place = {
    label: 'Hagen Norge',
    mark: TreePine,
};

/**
 * A place's mark: a site's own icon, or Overview's and Shared's.
 */
function Mark({ place }: { place: Place }) {
    const Icon = place.mark;
    return (
        <span className={styles.mark} aria-hidden>
            <Icon />
        </span>
    );
}

/**
 * The bar across the top of a screen: the place, which opens the finder,
 * then the steps to the screen.
 */
function PathBar({ place, steps }: { place: Place; steps: readonly string[] }) {
    return (
        <div className={styles.pathBar}>
            <span className={styles.pathPlace}>
                <Mark place={place} />
                {place.label}
                <ChevronsUpDown className={styles.chevron} aria-hidden />
            </span>
            {steps.map((step, index) => (
                <span key={step} className={clsx(styles.pathStep, index === steps.length - 1 && styles.pathCurrent)}>
                    <span className={styles.pathSeparator} aria-hidden>
                        /
                    </span>
                    {step}
                </span>
            ))}
        </div>
    );
}

/**
 * The finder the path bar's place opens: an admin over every site picks
 * among Overview, every site and Shared, a site's editor among their own
 * site and Shared.
 */
export function Switcher({ as }: { as: 'admin' | 'site' }) {
    const places = as === 'admin' ? [overview, hagenGroup, uk, norway] : [uk];
    const option = (place: Place) => (
        <div key={place.label} className={clsx(editor.option, place === uk && editor.optionActive)}>
            <Mark place={place} />
            {place.label}
            {place === uk ? <Check className={editor.check} aria-hidden /> : null}
        </div>
    );

    return (
        <Editor className={styles.switcher}>
            <PathBar place={uk} steps={['Dashboard']} />
            <div className={clsx(editor.popup, styles.finder)}>
                <div className={editor.search}>
                    <Search aria-hidden />
                    <span className={styles.muted}>Find a site</span>
                </div>
                <div className={editor.options}>
                    {places.map(option)}
                    <div className={styles.separator} role="separator" />
                    {option(shared)}
                </div>
            </div>
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
 * A document as the admin opens it: the path bar, then its title and where
 * it stands, with its action on the right.
 */
function DocumentMock({
    place,
    steps,
    title,
    action,
    children,
}: {
    place: Place;
    steps: readonly string[];
    title: string;
    action: string;
    children: ReactNode;
}) {
    return (
        <Editor className={editor.shell}>
            <PathBar place={place} steps={steps} />
            <div className={styles.documentHead}>
                <span className={editor.titleName}>{title}</span>
                <span className={editor.status}>Unpublished changes</span>
                <span className={styles.documentAction}>
                    <Button variant="primary">{action}</Button>
                </span>
            </div>
            {children}
        </Editor>
    );
}

/**
 * A field's label, with the site or Shared whose value it is.
 */
function OwnedRow({ label, owner, children }: { label: string; owner: string; children: ReactNode }) {
    return (
        <div className={editor.row}>
            <span className={editor.label}>
                {label}
                <span className={styles.owner}>{owner}</span>
            </span>
            <div className={editor.inputs}>{children}</div>
        </div>
    );
}

/**
 * Hagen UK's tab of a shared office: only the UK's own values, which the
 * UK's editor writes and publishes, and only the UK refreshes.
 */
export function OwnItem() {
    return (
        <DocumentMock place={shared} steps={['Offices', 'Harbour Office']} title="Harbour Office" action="Publish">
            <div className={editor.tabs}>
                <span className={editor.tab}>
                    <Mark place={shared} />
                    Shared
                </span>
                <span className={clsx(editor.tab, editor.tabActive)}>
                    <Mark place={uk} />
                    Hagen UK
                    <span className={styles.count}>2</span>
                </span>
            </div>
            <FormSection>
                <OwnedRow label="Phone" owner="Hagen UK">
                    <TextInput value="+44 20 0000 0111" mark="changed" />
                    <span className={styles.useShared}>
                        <Undo2 aria-hidden />
                        Use shared
                    </span>
                </OwnedRow>
                <OwnedRow label="Opening hours" owner="Hagen UK">
                    <TextInput value="Mon to Fri, 08:00 to 16:00" />
                </OwnedRow>
            </FormSection>
        </DocumentMock>
    );
}

/**
 * The shared Privacy Policy, as the UK's editor sees it: they draft, an admin
 * over every site publishes.
 */
export function SharedItem() {
    return (
        <DocumentMock place={shared} steps={['Privacy Policy']} title="Privacy Policy" action="Ask for review">
            <FormSection>
                <OwnedRow label="Contact email" owner="Shared">
                    <TextInput value="privacy@hagen.example.com" mark="changed" />
                </OwnedRow>
            </FormSection>
        </DocumentMock>
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
