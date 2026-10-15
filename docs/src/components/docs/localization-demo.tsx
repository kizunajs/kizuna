'use client';

import clsx from 'clsx';
import { useState } from 'react';
import Logo from '@/icons/Logo.svg';
import editor from '@/components/landing-page/cms/cms-editor.module.css';
import panel from '@/components/landing-page/panel.module.css';
import demo from './editing-demo.module.css';
import styles from './localization-demo.module.css';

type Locale = 'en' | 'nb' | 'de';

interface Field {
    name: string;
    label: string;
    localized: boolean;
}

const fields: Field[] = [
    {
        name: 'name',
        label: 'Name',
        localized: true,
    },
    {
        name: 'summary',
        label: 'Summary',
        localized: true,
    },
    {
        name: 'code',
        label: 'Product code',
        localized: false,
    },
];

const locales: Array<{ code: Locale; label: string; path: string }> = [
    {
        code: 'en',
        label: 'English',
        path: 'example.com/products/hot-water-tank-300',
    },
    {
        code: 'nb',
        label: 'Norwegian',
        path: 'example.no/produkter/varmtvannsbereder-300',
    },
    {
        code: 'de',
        label: 'German',
        path: 'example.de/produkte/warmwasserspeicher-300',
    },
];

type Values = Record<string, string>;

interface Copy {
    values: Values;
    published: Values | undefined;
    from: Values | undefined;
}

const initial: Record<Locale, Copy> = {
    en: {
        values: {
            name: 'Hot Water Tank 300 L',
            summary: 'For a household of up to six.',
            code: 'HWT-300',
        },
        published: {
            name: 'Hot Water Tank 300 L',
            summary: 'For a household of up to six.',
            code: 'HWT-300',
        },
        from: undefined,
    },
    nb: {
        values: {
            name: 'Varmtvannsbereder 300 L',
            summary: 'For en husholdning på opptil seks.',
        },
        published: {
            name: 'Varmtvannsbereder 300 L',
            summary: 'For en husholdning på opptil seks.',
        },
        from: {
            name: 'Hot Water Tank 300 L',
            summary: 'For a household of up to six.',
        },
    },
    de: {
        values: {
            name: '',
            summary: '',
        },
        published: undefined,
        from: undefined,
    },
};

const translated = fields.filter((field) => field.localized);

const differs = (left: Values, right: Values | undefined, names: string[]) => names.some((name) => left[name] !== (right?.[name] ?? ''));

/**
 * One product in three languages: English is the source, each translation
 * publishes on its own, and a translation made from an older English is behind.
 */
export function LocalizationDemo() {
    const [locale, setLocale] = useState<Locale>('en');
    const [copies, setCopies] = useState(initial);

    const source = copies.en;
    const copy = copies[locale];
    const isSource = locale === 'en';
    const names = (isSource ? fields : translated).map((field) => field.name);

    const behindFields = (code: Locale) =>
        code === 'en' || copies[code].from === undefined || source.published === undefined
            ? []
            : translated.filter((field) => copies[code].from?.[field.name] !== source.published?.[field.name]);

    const statusOf = (code: Locale) => {
        const current = copies[code];
        if (current.published === undefined && current.values.name === '') return 'Not translated';
        if (behindFields(code).length > 0) return 'Behind';
        if (
            differs(
                current.values,
                current.published,
                code === 'en' ? fields.map((field) => field.name) : translated.map((field) => field.name)
            )
        )
            return 'Unpublished changes';
        return 'Published';
    };

    const edit = (name: string, value: string) =>
        setCopies((current) => ({
            ...current,
            [locale]: {
                ...current[locale],
                values: {
                    ...current[locale].values,
                    [name]: value,
                },
            },
        }));

    const publish = () =>
        setCopies((current) => ({
            ...current,
            [locale]: {
                ...current[locale],
                published: {
                    ...current[locale].values,
                },
                from: isSource
                    ? undefined
                    : Object.fromEntries(translated.map((field) => [field.name, current.en.published?.[field.name] ?? ''])),
            },
        }));

    const label = locales.find((candidate) => candidate.code === locale)?.label ?? '';
    const shown = copy.published;
    const address = locales.find((candidate) => candidate.code === locale)?.path ?? '';
    const behind = behindFields(locale);
    const canPublish =
        (differs(copy.values, copy.published, names) || behind.length > 0) && names.every((name) => copy.values[name] !== '');

    return (
        <div className={clsx(panel.panel, demo.demo)}>
            <div className={clsx(editor.editor, styles.window)}>
                <div className={demo.header}>
                    <Logo className={demo.logo} aria-hidden />
                    <span className={demo.title}>
                        <span className={demo.muted}>Products / </span>
                        Hot Water Tank 300 L
                    </span>
                </div>

                <div className={styles.locales} role="tablist" aria-label="Language">
                    {locales.map((candidate) => (
                        <button
                            key={candidate.code}
                            type="button"
                            role="tab"
                            aria-selected={candidate.code === locale}
                            className={clsx(styles.locale, candidate.code === locale && styles.localeOpen)}
                            onClick={() => setLocale(candidate.code)}>
                            <span className={styles.code}>{candidate.code.toUpperCase()}</span>
                            <span className={demo.muted}>{statusOf(candidate.code)}</span>
                        </button>
                    ))}
                </div>

                <div className={demo.fields}>
                    {fields.map((field) => {
                        const fieldBehind = behind.some((candidate) => candidate.name === field.name);
                        const shared = !field.localized && !isSource;
                        return (
                            <div key={field.name} className={demo.row}>
                                <span className={clsx(demo.label, styles.label)}>
                                    {field.label}
                                    {field.localized ? <span className={styles.marker}>{locale.toUpperCase()}</span> : null}
                                </span>
                                {isSource || shared ? (
                                    <input
                                        className={clsx(
                                            demo.input,
                                            !shared && copy.values[field.name] !== (copy.published?.[field.name] ?? '') && demo.inputChanged
                                        )}
                                        aria-label={`${field.label}, ${label}`}
                                        readOnly={shared}
                                        value={shared ? (source.published?.[field.name] ?? '') : copy.values[field.name]}
                                        onChange={(event) => edit(field.name, event.target.value)}
                                    />
                                ) : (
                                    <div
                                        className={clsx(
                                            styles.translation,
                                            copy.values[field.name] !== (copy.published?.[field.name] ?? '') && styles.translationChanged
                                        )}>
                                        <input
                                            className={styles.translationInput}
                                            aria-label={`${field.label}, ${label}`}
                                            placeholder="Not translated yet"
                                            value={copy.values[field.name]}
                                            onChange={(event) => edit(field.name, event.target.value)}
                                        />
                                        <span className={clsx(styles.source, fieldBehind && styles.sourceChanged)}>
                                            <span className={styles.code}>EN</span>
                                            {fieldBehind ? (
                                                <span>
                                                    <del>{copy.from?.[field.name]}</del> {source.published?.[field.name]}
                                                </span>
                                            ) : (
                                                <span>{source.published?.[field.name]}</span>
                                            )}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className={demo.footer}>
                    <span />
                    <button type="button" className={clsx(demo.button, demo.primary)} disabled={!canPublish} onClick={publish}>
                        Publish {label}
                    </button>
                </div>
            </div>

            <div className={clsx(editor.editor, styles.visitor)}>
                <span className={styles.address}>{address}</span>
                {shown === undefined ? (
                    <span className={demo.muted}>404, not found in {label}</span>
                ) : (
                    <>
                        <span className={styles.visitorName}>{shown.name}</span>
                        <span>{shown.summary}</span>
                        <span className={demo.muted}>{source.published?.code}</span>
                    </>
                )}
            </div>
        </div>
    );
}
