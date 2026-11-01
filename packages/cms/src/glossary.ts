/**
 * The name of the built-in global that holds a voice and its glossary, on
 * Shared and on every site.
 */
export const VOICE_GLOBAL = 'voice';

/**
 * What a glossary term asks: `keep` it as written in every translation,
 * `translate` it as `use`, or `avoid` it.
 */
export type GlossaryRule = 'keep' | 'translate' | 'avoid';

/**
 * One row of a glossary.
 */
export interface GlossaryTerm {
    /**
     * Every spelling the rule covers, inflections included: billig, billige,
     * billigste.
     */
    forms: readonly string[];
    rule: GlossaryRule;
    /**
     * The language the rule holds in. Every language when left out.
     */
    language?: string | undefined;
    /**
     * For `translate`, what the forms are written as. For `avoid`, the word
     * to write instead.
     */
    use?: string | undefined;
    /**
     * Why, for the model and the person.
     */
    note?: string | undefined;
}

/**
 * A glossary term for one site and language, with where it was written: the
 * group's voice on Shared, or the site's own.
 */
export interface VoiceTerm extends GlossaryTerm {
    from: 'group' | 'site';
}

/**
 * A word in a field that the glossary flags. Always a warning.
 */
export interface GlossaryIssue {
    /**
     * The field, by path.
     */
    path: string;
    /**
     * The language the field is in, or `null` for a document without
     * languages.
     */
    locale: string | null;
    /**
     * The form the field says, or for a translation, the form its source
     * says.
     */
    form: string;
    rule: GlossaryRule;
    use: string | null;
    detail: string;
}

/**
 * One text of a document: the field it belongs to, by path, and what it
 * says.
 */
export interface GlossaryText {
    field: string;
    text: string;
}

const lower = (value: string): string => value.toLocaleLowerCase();

/**
 * Whether a term holds in a language: a term without one holds in every
 * language, and `nb` holds in `nb-NO`.
 */
export const holdsIn = (term: { language?: string | undefined }, language: string | null | undefined): boolean => {
    if (term.language === undefined || term.language === '') return true;
    if (language === null || language === undefined) return false;
    return lower(language) === lower(term.language) || lower(language).startsWith(`${lower(term.language)}-`);
};

/**
 * The terms that hold for a site in a language: the group's, with any the
 * site writes for one of the same forms replaced by the site's, then the
 * site's own.
 */
export const termsFor = (
    group: readonly GlossaryTerm[],
    site: readonly GlossaryTerm[],
    language: string | null | undefined
): VoiceTerm[] => {
    const own = site.filter((term) => holdsIn(term, language));
    const replaced = new Set(own.flatMap((term) => term.forms.map(lower)));
    return [
        ...group
            .filter((term) => holdsIn(term, language) && !term.forms.some((form) => replaced.has(lower(form))))
            .map(
                (term): VoiceTerm => ({
                    ...term,
                    from: 'group',
                })
            ),
        ...own.map(
            (term): VoiceTerm => ({
                ...term,
                from: 'site',
            })
        ),
    ];
};

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether the text holds the form as a whole word: in any case, or with
 * `exact`, only as written.
 */
export const occurs = (text: string, form: string, exact = false): boolean => foundIn(text, form, exact) !== undefined;

/**
 * The form as the text writes it, found as a whole word, or `undefined`.
 */
const foundIn = (text: string, form: string, exact = false): string | undefined => {
    const trimmed = form.trim();
    if (trimmed === '') return undefined;
    return new RegExp(`(?<![\\p{L}\\p{N}])${escape(trimmed)}(?![\\p{L}\\p{N}])`, exact ? 'u' : 'iu').exec(text)?.[0];
};

/**
 * The terms whose forms, or `use`, a text holds, for the model to read
 * beside it.
 */
export const termsIn = (texts: readonly string[], terms: readonly VoiceTerm[]): VoiceTerm[] => {
    const joined = texts.join('\n');
    return terms.filter(
        (term) =>
            term.forms.some((form) => occurs(joined, form, term.rule === 'keep')) ||
            (term.use !== undefined && term.use !== '' && occurs(joined, term.use))
    );
};

/**
 * `The summary` from a field's label.
 */
const theField = (label: string): string => {
    const named =
        label.length > 1 && label[1] === label[1]!.toLocaleUpperCase() ? label : label.charAt(0).toLocaleLowerCase() + label.slice(1);
    return `The ${named}`;
};

const byField = (texts: readonly GlossaryText[]): Map<string, string> => {
    const joined = new Map<string, string>();
    for (const text of texts) joined.set(text.field, joined.has(text.field) ? `${joined.get(text.field)}\n${text.text}` : text.text);
    return joined;
};

/**
 * What the glossary flags in a document's texts. With `source`, the texts are
 * a translation and each field is compared with its source field: a `keep`
 * term the source says stays as written, and a `translate` term reads as its
 * `use`. `writer` names who writes this way, like `Hagen Norge`, and
 * `labelOf` names a field.
 *
 * @example
 * glossaryIssues({
 *     texts: [
 *         {
 *             field: 'summary',
 *             text: 'Billige planter til balkongen',
 *         },
 *     ],
 *     terms,
 *     locale: 'nb',
 *     writer: 'Hagen Norge',
 *     labelOf: () => 'Summary',
 * });
 */
export const glossaryIssues = (input: {
    texts: readonly GlossaryText[];
    source?: readonly GlossaryText[] | undefined;
    terms: readonly VoiceTerm[];
    locale: string | null;
    writer?: string | undefined;
    labelOf: (field: string) => string;
}): GlossaryIssue[] => {
    const issues: GlossaryIssue[] = [];
    const seen = new Set<string>();
    const add = (field: string, term: VoiceTerm, form: string, detail: string): void => {
        const key = `${field}\u0000${term.rule}\u0000${lower(form)}`;
        if (seen.has(key)) return;
        seen.add(key);
        issues.push({
            path: field,
            locale: input.locale,
            form,
            rule: term.rule,
            use: term.use === undefined || term.use === '' ? null : term.use,
            detail,
        });
    };
    const writes = (use: string): string => (input.writer === undefined ? `Write ${use}.` : `${input.writer} writes ${use}.`);
    const texts = byField(input.texts);
    const sources = input.source === undefined ? undefined : byField(input.source);
    for (const [field, text] of texts) {
        const the = theField(input.labelOf(field));
        for (const term of input.terms) {
            const use = term.use === undefined || term.use === '' ? undefined : term.use;
            if (term.rule === 'keep') continue;
            for (const form of term.forms) {
                if (use !== undefined && lower(form.trim()) === lower(use.trim())) continue;
                const written = foundIn(text, form);
                if (written === undefined || (term.rule === 'translate' && use === undefined)) continue;
                add(
                    field,
                    term,
                    written,
                    use === undefined
                        ? `${the} says ${written}, which ${input.writer ?? 'the glossary'} never writes.`
                        : `${the} says ${written}. ${writes(use)}`
                );
            }
        }
    }
    if (sources === undefined) return issues;
    for (const [field, source] of sources) {
        const text = texts.get(field) ?? '';
        if (text === '') continue;
        const the = theField(input.labelOf(field));
        for (const term of input.terms) {
            if (term.rule === 'avoid') continue;
            const use = term.use === undefined || term.use === '' ? undefined : term.use;
            for (const form of term.forms) {
                if (term.rule === 'keep') {
                    if (occurs(source, form, true) && !occurs(text, form, true)) {
                        add(field, term, form, `${the} leaves out ${form}, which its source says and every language keeps as written.`);
                    }
                    continue;
                }
                if (use === undefined || !occurs(source, form) || occurs(text, use)) continue;
                add(
                    field,
                    term,
                    form,
                    `${the} leaves out ${use}. Its source says ${form}, which ${input.writer ?? 'the glossary'} writes as ${use}.`
                );
            }
        }
    }
    return issues;
};

/**
 * Whether an issue is about the field at `path` or a field inside it.
 */
export const isUnder = (issue: { path: string }, path: string): boolean => issue.path === path || issue.path.startsWith(`${path}.`);
