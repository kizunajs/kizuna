import { Languages } from 'lucide-react';
import type { DocumentLocales } from '../view/schema.js';
import { hrefOf } from './navigation.js';
import { refInLocale } from './translation.js';
import { ICON } from '../view/context.js';

/**
 * Where one language's copy stands, as its tab reads.
 */
export const localeStatusOf = (entry: DocumentLocales['locales'][number], source: boolean): string => {
    if (entry.status === 'empty') return source ? 'Empty' : 'Not translated';
    if (entry.sourceChanged > 0) return 'Source changed';
    return entry.status === 'published' ? 'Published' : 'Unpublished changes';
};

/**
 * A document's languages under its header, each with where its copy stands.
 * The source comes first. In a translation, Translate drafts it from the
 * source when `onTranslate` is given.
 */
export function LocaleTabs({
    documentRef,
    locales,
    onTranslate,
    translating,
}: {
    documentRef: string;
    locales: DocumentLocales;
    onTranslate?: (() => void) | undefined;
    translating?: boolean;
}) {
    const tabs = (
        <nav className="k-locale-tabs" aria-label="Language">
            {locales.locales.map((entry) => (
                <a
                    key={entry.code}
                    className="k-locale-tabs__tab"
                    href={hrefOf({
                        kind: 'document',
                        ref: refInLocale(documentRef, entry.code, locales.source),
                    })}
                    aria-current={entry.code === locales.current ? 'page' : undefined}>
                    <span className="k-locale-tabs__code">{entry.code.toUpperCase()}</span>
                    <span className="k-locale-tabs__status">{localeStatusOf(entry, entry.code === locales.source)}</span>
                </a>
            ))}
        </nav>
    );
    if (onTranslate === undefined || locales.current === locales.source) return tabs;
    return (
        <div className="k-locale-bar">
            {tabs}
            <button type="button" className="k-text-button" disabled={translating === true} onClick={onTranslate}>
                <Languages {...ICON} />
                {translating === true ? 'Translating…' : 'Translate'}
            </button>
        </div>
    );
}
