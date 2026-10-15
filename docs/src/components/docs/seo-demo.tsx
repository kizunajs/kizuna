'use client';

import clsx from 'clsx';
import { useState } from 'react';
import Logo from '@/icons/Logo.svg';
import editor from '@/components/landing-page/cms/cms-editor.module.css';
import panel from '@/components/landing-page/panel.module.css';
import demo from './editing-demo.module.css';
import styles from './seo-demo.module.css';

type PageName = 'article' | 'front';
type Shown = 'search' | 'link' | 'tags';

interface Page {
    tab: string;
    title: string;
    generatedTitle: string;
    generatedDescription: string;
    address: string;
    url: string;
    image: string;
    suffix: boolean;
}

const SUFFIX = ' | Acme Blog';

const pages: Record<PageName, Page> = {
    article: {
        tab: 'Article',
        title: 'New Office, Same People',
        generatedTitle: 'New Office, Same People',
        generatedDescription: 'We have moved to 12 Harbour Street. Same team, same phone number, a better view.',
        address: 'example.com › blog › new-office',
        url: 'https://example.com/blog/new-office',
        image: '/cms/office-corridor.jpg',
        suffix: true,
    },
    front: {
        tab: 'Front Page',
        title: 'Front Page',
        generatedTitle: 'Acme Blog',
        generatedDescription: 'What we are building, who is building it, and why.',
        address: 'example.com',
        url: 'https://example.com/',
        image: '/cms/team-at-laptops.jpg',
        suffix: false,
    },
};

const pageNames: PageName[] = ['article', 'front'];

const IMAGES = ['/cms/office-corridor.jpg', '/cms/team-at-laptops.jpg'];

interface Written {
    image: string;
    title: string;
    description: string;
    siteName: boolean;
    indexed: boolean;
    follow: boolean;
    canonical: string;
}

const startOf = (page: Page): Written => ({
    image: '',
    title: '',
    description: '',
    siteName: page.suffix,
    indexed: true,
    follow: true,
    canonical: '',
});

const shownTabs: Array<{ value: Shown; label: string }> = [
    {
        value: 'search',
        label: 'Search',
    },
    {
        value: 'link',
        label: 'Shared link',
    },
    {
        value: 'tags',
        label: 'Tags',
    },
];

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <label className={styles.switchRow}>
            <span className={demo.label}>{label}</span>
            <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                className={clsx(styles.switch, checked && styles.switchOn)}
                onClick={() => onChange(!checked)}>
                <span className={styles.knob} />
            </button>
        </label>
    );
}

/**
 * A page's search result in the editor: what the code generates is the
 * placeholder, what the editor writes replaces it, and the preview follows.
 */
export function SeoDemo() {
    const [pageName, setPageName] = useState<PageName>('article');
    const [shown, setShown] = useState<Shown>('search');
    const [written, setWritten] = useState<Record<PageName, Written>>({
        article: startOf(pages.article),
        front: startOf(pages.front),
    });

    const page = pages[pageName];
    const values = written[pageName];
    const suffix = values.siteName ? SUFFIX : '';
    const title = `${values.title || page.generatedTitle}${suffix}`;
    const description = values.description || page.generatedDescription;
    const image = values.image || page.image;
    const canonical = values.canonical || page.url;
    const robots = [values.indexed ? undefined : 'noindex', values.follow ? undefined : 'nofollow'].filter(Boolean).join(', ');
    const tags = [
        `<title>${title}</title>`,
        `<meta name="description" content="${description}">`,
        `<link rel="canonical" href="${canonical}">`,
        ...(robots === '' ? [] : [`<meta name="robots" content="${robots}">`]),
        `<meta property="og:image" content="https://example.com${image}">`,
    ];

    const write = (next: Partial<Written>) =>
        setWritten((current) => ({
            ...current,
            [pageName]: {
                ...current[pageName],
                ...next,
            },
        }));

    return (
        <div className={clsx(panel.panel, demo.demo)}>
            <div className={demo.people} role="tablist" aria-label="Page">
                {pageNames.map((candidate) => (
                    <button
                        key={candidate}
                        type="button"
                        role="tab"
                        aria-selected={pageName === candidate}
                        className={clsx(panel.tab, pageName === candidate && panel.tabActive, demo.person)}
                        onClick={() => setPageName(candidate)}>
                        {pages[candidate].tab}
                    </button>
                ))}
            </div>

            <div className={clsx(editor.editor, styles.window)}>
                <div className={demo.header}>
                    <Logo className={demo.logo} aria-hidden />
                    <span className={demo.title}>{page.title}</span>
                </div>

                <div className={demo.fields}>
                    <label className={demo.row}>
                        <span className={demo.label}>Search title</span>
                        <span className={styles.field}>
                            <span className={styles.titleInput}>
                                <input
                                    className={styles.bare}
                                    placeholder={page.generatedTitle}
                                    value={values.title}
                                    onChange={(event) =>
                                        write({
                                            title: event.target.value,
                                        })
                                    }
                                />
                                {suffix === '' ? null : <span className={styles.suffix}>{suffix.trim()}</span>}
                            </span>
                            <span className={clsx(styles.counter, title.length > 60 && styles.over)}>{title.length}/60</span>
                        </span>
                    </label>
                    <Switch
                        label="Site name"
                        checked={values.siteName}
                        onChange={(checked) =>
                            write({
                                siteName: checked,
                            })
                        }
                    />
                    <label className={demo.row}>
                        <span className={demo.label}>Description</span>
                        <span className={styles.field}>
                            <input
                                className={styles.bare}
                                placeholder={page.generatedDescription}
                                value={values.description}
                                onChange={(event) =>
                                    write({
                                        description: event.target.value,
                                    })
                                }
                            />
                            <span className={clsx(styles.counter, description.length > 160 && styles.over)}>{description.length}/160</span>
                        </span>
                    </label>
                    <div className={demo.row}>
                        <span className={demo.label}>Image</span>
                        <span className={styles.imageRow}>
                            <img className={styles.thumb} src={image} alt="" />
                            <button
                                type="button"
                                className={clsx(demo.button, demo.secondary, styles.small)}
                                onClick={() =>
                                    write({
                                        image: IMAGES.find((candidate) => candidate !== image) ?? image,
                                    })
                                }>
                                Replace
                            </button>
                            {values.image === '' ? null : (
                                <button
                                    type="button"
                                    className={styles.reset}
                                    onClick={() =>
                                        write({
                                            image: '',
                                        })
                                    }>
                                    Use the page's
                                </button>
                            )}
                        </span>
                    </div>
                </div>

                <div className={demo.fields}>
                    <span className={styles.sectionTitle}>Search engines</span>
                    <Switch
                        label="Index"
                        checked={values.indexed}
                        onChange={(checked) =>
                            write({
                                indexed: checked,
                            })
                        }
                    />
                    <Switch
                        label="Follow"
                        checked={values.follow}
                        onChange={(checked) =>
                            write({
                                follow: checked,
                            })
                        }
                    />
                    <label className={demo.row}>
                        <span className={demo.label}>Canonical</span>
                        <span className={styles.field}>
                            <input
                                className={styles.bare}
                                placeholder={page.url}
                                value={values.canonical}
                                onChange={(event) =>
                                    write({
                                        canonical: event.target.value,
                                    })
                                }
                            />
                        </span>
                    </label>
                </div>

                <div className={styles.previewTabs} role="tablist" aria-label="Preview">
                    {shownTabs.map((tab) => (
                        <button
                            key={tab.value}
                            type="button"
                            role="tab"
                            aria-selected={shown === tab.value}
                            className={clsx(styles.previewTab, shown === tab.value && styles.previewTabOpen)}
                            onClick={() => setShown(tab.value)}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {shown === 'search' ? (
                    <div className={styles.result}>
                        {values.indexed ? (
                            <>
                                <span className={demo.muted}>{page.address}</span>
                                <span className={styles.resultTitle}>{title}</span>
                                <span className={styles.resultText}>{description}</span>
                            </>
                        ) : (
                            <span className={demo.muted}>Not in search results, and left out of the sitemap.</span>
                        )}
                    </div>
                ) : shown === 'tags' ? (
                    <div className={styles.tags}>
                        {tags.map((tag) => (
                            <span key={tag}>{tag}</span>
                        ))}
                    </div>
                ) : (
                    <div className={styles.card}>
                        <img src={image} alt="" />
                        <span className={styles.cardText}>
                            <span className={demo.muted}>example.com</span>
                            <span className={styles.resultTitle}>{title}</span>
                            <span className={styles.resultText}>{description}</span>
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
