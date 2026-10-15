'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { FileText, Globe, Library, Search } from 'lucide-react';
import Logo from '@/icons/Logo.svg';
import editor from '@/components/landing-page/cms/cms-editor.module.css';
import panel from '@/components/landing-page/panel.module.css';
import demo from './editing-demo.module.css';
import styles from './access-demo.module.css';

type Name = 'kim' | 'kari' | 'lena' | 'ola' | 'ingrid';

interface Entry {
    label: string;
    icon: 'page' | 'global' | 'collection';
    count?: number;
}

interface Field {
    label: string;
    value: string;
    locked?: boolean;
}

interface Person {
    name: string;
    sees: Entry[];
    open: string;
    fields: Field[];
    publishes: boolean;
    locale?: string;
}

const frontPage: Entry = {
    label: 'Front Page',
    icon: 'page',
};

const about: Entry = {
    label: 'About',
    icon: 'page',
};

const careers: Entry = {
    label: 'Careers',
    icon: 'page',
};

const footer: Entry = {
    label: 'Footer',
    icon: 'global',
};

const articles: Entry = {
    label: 'Articles',
    icon: 'collection',
    count: 12,
};

const employees: Entry = {
    label: 'Employees',
    icon: 'collection',
    count: 3,
};

const footerFields = (locked: boolean): Field[] => [
    {
        label: 'Phone',
        value: '+44 20 0000 0100',
    },
    {
        label: 'Legal name',
        value: 'Acme Heating Ltd',
        locked,
    },
];

const people: Record<Name, Person> = {
    kim: {
        name: 'Kim, admin',
        sees: [frontPage, about, careers, footer, articles, employees],
        open: 'Footer',
        fields: footerFields(false),
        publishes: true,
    },
    kari: {
        name: 'Kari, editor',
        sees: [frontPage, about, footer, articles, employees],
        open: 'Footer',
        fields: footerFields(true),
        publishes: false,
    },
    lena: {
        name: 'Lena, recruiter',
        sees: [careers],
        open: 'Careers',
        fields: [
            {
                label: 'Heading',
                value: 'Join the team',
            },
        ],
        publishes: true,
    },
    ola: {
        name: 'Ola, employee',
        sees: [
            {
                ...employees,
                count: 1,
            },
        ],
        open: 'Employees / Ola Nordmann',
        fields: [
            {
                label: 'Title',
                value: 'Service engineer',
            },
            {
                label: 'Email',
                value: 'ola@acme.com',
            },
        ],
        publishes: false,
    },
    ingrid: {
        name: 'Ingrid, translator',
        sees: [frontPage, about, careers, footer, articles, employees],
        open: 'Front Page',
        fields: [
            {
                label: 'Heading',
                value: 'Varmepumpe, montert på en dag',
            },
        ],
        publishes: false,
        locale: 'NB',
    },
};

const names: Name[] = ['kim', 'kari', 'lena', 'ola', 'ingrid'];

const icons = {
    page: FileText,
    global: Globe,
    collection: Library,
};

/**
 * The editor as five people on one site see it: what it lists, which fields
 * they may change, and whether they publish or ask for a review.
 */
export function AccessDemo() {
    const [name, setName] = useState<Name>('kari');
    const person = people[name];

    return (
        <div className={clsx(panel.panel, demo.demo)}>
            <div className={demo.people} role="tablist" aria-label="Signed in as">
                <span className={styles.signedIn}>Signed in as</span>
                {names.map((candidate) => (
                    <button
                        key={candidate}
                        type="button"
                        role="tab"
                        aria-selected={name === candidate}
                        className={clsx(panel.tab, name === candidate && panel.tabActive, demo.person)}
                        onClick={() => setName(candidate)}>
                        {people[candidate].name}
                    </button>
                ))}
            </div>
            <div className={clsx(editor.editor, demo.window, styles.window)}>
                <nav className={demo.switcher} aria-label="Content">
                    <div className={demo.search}>
                        <Search aria-hidden />
                        Find
                    </div>
                    <div className={demo.group}>
                        {person.sees.map((entry) => {
                            const Icon = icons[entry.icon];
                            const open = person.open === entry.label || person.open.startsWith(`${entry.label} /`);
                            return (
                                <span key={entry.label} className={clsx(demo.entry, open && demo.entryOpen)}>
                                    <Icon aria-hidden />
                                    <span className={demo.entryLabel}>{entry.label}</span>
                                    {entry.count === undefined ? null : <span className={demo.count}>{entry.count}</span>}
                                </span>
                            );
                        })}
                    </div>
                </nav>
                <div className={demo.form}>
                    <div className={demo.header}>
                        <Logo className={demo.logo} aria-hidden />
                        <span className={demo.title}>{person.open}</span>
                        {person.locale === undefined ? null : <span className={demo.status}>{person.locale}</span>}
                    </div>
                    <div className={demo.fields}>
                        {person.fields.map((field) => (
                            <div key={field.label} className={demo.row}>
                                <span className={demo.label}>{field.label}</span>
                                <span className={clsx(demo.input, styles.value, field.locked && styles.locked)}>{field.value}</span>
                            </div>
                        ))}
                    </div>
                    <div className={demo.footer}>
                        <span />
                        <span className={clsx(demo.button, person.publishes ? demo.primary : demo.secondary)}>
                            {person.publishes ? 'Publish' : 'Ask for review'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
