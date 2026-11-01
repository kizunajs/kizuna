import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import type { CmsService, DraftState } from './cms.js';
import { defineGlobal, type Global } from './definitions.js';
import { dataFields, type FieldAuth } from './field.js';
import {
    glossaryIssues,
    holdsIn,
    termsFor,
    termsIn,
    VOICE_GLOBAL,
    type GlossaryIssue,
    type GlossaryTerm,
    type VoiceTerm,
} from './glossary.js';
import { DEFAULT_SITE } from './options.js';
import { SOURCE_LOCALE } from './storage/store.js';
import { textsOf } from './translate.js';

/**
 * Turns on the built-in `voice` global, on Shared and on every site.
 *
 * @example
 * voice: {
 *     roles: 'admin',
 * },
 */
export interface VoiceOptions {
    /**
     * Who may change a voice. A model reads it as instructions, so keep it
     * to the people who decide how the brand sounds.
     */
    roles: string | readonly string[];
}

/**
 * One row of a glossary: the forms it covers, what it asks of them, and in
 * which language.
 */
export const GlossaryTermSchema = Kizuna.model({
    title: 'CMS.GlossaryTerm',
    schema: z.object({
        forms: z
            .array(z.string().min(1).max(80))
            .min(1)
            .describe(
                'Every spelling the rule covers, inflections included, like billig, billige, billigste. Each is matched as a whole word in any case, and a kept one only as written, so nothing is guessed.'
            ),
        rule: z
            .enum(['keep', 'translate', 'avoid'])
            .describe('keep it as written in every translation, translate it as `use`, or avoid it.'),
        language: z.string().max(20).optional().describe('The language the rule holds in. Every language when left out.'),
        use: z.string().max(80).optional().describe('What the forms are written as, or the word to write instead of one avoided.'),
        note: z.string().max(300).optional().describe('Why, for whoever writes next.'),
    }),
});

/**
 * One thing to do, or not do, when writing, in one language or all.
 */
export const VoiceRuleSchema = Kizuna.model({
    title: 'CMS.VoiceRule',
    schema: z.object({
        kind: z.enum(['do', 'dont']),
        text: z.string().min(1).max(300),
        language: z.string().max(20).optional().describe('The language the rule holds in. Every language when left out.'),
    }),
});

type VoiceRule = z.output<typeof VoiceRuleSchema>;

/**
 * The built-in `voice` global, which only `roles` may change.
 */
export const voiceGlobal = (options: VoiceOptions): Global => {
    const auth: FieldAuth = {
        roles: options.roles,
    };
    return defineGlobal({
        name: VOICE_GLOBAL,
        label: 'Voice',
        fields: [
            {
                type: 'tab',
                label: 'Voice',
                fields: [
                    {
                        name: 'tone',
                        schema: z.string().max(2000).default(''),
                        description: 'How the writing sounds, like warm, practical, no hype.',
                        auth,
                        localized: false,
                    },
                    {
                        name: 'audience',
                        schema: z.string().max(2000).default(''),
                        description: 'Who reads it, and what they already know.',
                        auth,
                        localized: false,
                    },
                    {
                        name: 'rules',
                        label: "Do and don't",
                        schema: z.array(VoiceRuleSchema).default([]),
                        auth,
                        localized: false,
                    },
                ],
            },
            {
                type: 'tab',
                label: 'Glossary',
                fields: [
                    {
                        name: 'glossary',
                        schema: z.array(GlossaryTermSchema).default([]),
                        auth,
                        localized: false,
                    },
                ],
            },
        ],
    });
};

/**
 * A site's voice in one language: the group's tone, audience and rules, then
 * the site's, and the glossary terms that hold there.
 */
export interface ResolvedVoice {
    /**
     * The site, or `null` for the group's voice on Shared.
     */
    site: string | null;
    language: string | null;
    tone: string[];
    audience: string[];
    rules: Array<VoiceRule & { from: 'group' | 'site' }>;
    glossary: VoiceTerm[];
}

interface StoredVoice {
    tone: string;
    audience: string;
    rules: VoiceRule[];
    glossary: GlossaryTerm[];
}

const EMPTY: StoredVoice = {
    tone: '',
    audience: '',
    rules: [],
    glossary: [],
};

/**
 * The published voice of Shared or a site, or an empty one.
 */
const publishedVoice = async (cms: CmsService, site: string): Promise<StoredVoice> => {
    const { row } = await cms.document({
        type: 'global',
        name: VOICE_GLOBAL,
        ...(site === DEFAULT_SITE
            ? {}
            : {
                  site,
              }),
    });
    const published = row?.published;
    if (published === null || published === undefined) return EMPTY;
    const parsed = z
        .object({
            tone: z.string().catch(''),
            audience: z.string().catch(''),
            rules: z.array(VoiceRuleSchema).catch([]),
            glossary: z.array(GlossaryTermSchema).catch([]),
        })
        .safeParse(published);
    return parsed.success ? parsed.data : EMPTY;
};

/**
 * The voice a site writes in, in a language: the group's published voice,
 * then the site's own. `site` is the default site, or left out, for the
 * group's alone. `language` left out keeps every rule and term.
 */
export const resolveVoice = async (cms: CmsService, site?: string, language?: string | null): Promise<ResolvedVoice | null> => {
    if (!cms.voiceOn()) return null;
    const own = site === undefined || site === DEFAULT_SITE ? undefined : site;
    const group = await publishedVoice(cms, DEFAULT_SITE);
    const forSite = own === undefined ? EMPTY : await publishedVoice(cms, own);
    const kept = (rule: VoiceRule): boolean => language === undefined || language === null || holdsIn(rule, language);
    return {
        site: own ?? null,
        language: language ?? null,
        tone: [group.tone, forSite.tone].map((text) => text.trim()).filter((text) => text !== ''),
        audience: [group.audience, forSite.audience].map((text) => text.trim()).filter((text) => text !== ''),
        rules: [
            ...group.rules.filter(kept).map((rule) => ({
                ...rule,
                from: 'group' as const,
            })),
            ...forSite.rules.filter(kept).map((rule) => ({
                ...rule,
                from: 'site' as const,
            })),
        ],
        glossary:
            language === undefined || language === null
                ? [
                      ...group.glossary.map(
                          (term): VoiceTerm => ({
                              ...term,
                              from: 'group',
                          })
                      ),
                      ...forSite.glossary.map(
                          (term): VoiceTerm => ({
                              ...term,
                              from: 'site',
                          })
                      ),
                  ]
                : termsFor(group.glossary, forSite.glossary, language),
    };
};

const quoted = (forms: readonly string[]): string => forms.map((form) => `"${form}"`).join(', ');

/**
 * One glossary term as a line a model reads.
 */
export const termLine = (term: GlossaryTerm): string => {
    const where = term.language === undefined ? '' : ` in ${term.language}`;
    const why = term.note === undefined || term.note === '' ? '' : ` ${term.note}`;
    if (term.rule === 'keep') return `- Keep ${quoted(term.forms)} exactly as written, in every language.${why}`;
    if (term.rule === 'translate') return `- Write ${quoted(term.forms)} as "${term.use ?? term.forms[0]}"${where}.${why}`;
    return term.use === undefined || term.use === ''
        ? `- Never write ${quoted(term.forms)}${where}.${why}`
        : `- Write "${term.use}", never ${quoted(term.forms)}${where}.${why}`;
};

/**
 * The voice as Markdown a model reads, with only the glossary terms given,
 * or nothing when the voice says nothing.
 */
export const voiceText = (voice: ResolvedVoice, terms: readonly VoiceTerm[] = voice.glossary): string => {
    const parts: string[] = [];
    if (voice.tone.length > 0) parts.push(`Tone:\n${voice.tone.join('\n\n')}`);
    if (voice.audience.length > 0) parts.push(`Audience:\n${voice.audience.join('\n\n')}`);
    const does = voice.rules.filter((rule) => rule.kind === 'do');
    const donts = voice.rules.filter((rule) => rule.kind === 'dont');
    if (does.length > 0) parts.push(`Do:\n${does.map((rule) => `- ${rule.text}`).join('\n')}`);
    if (donts.length > 0) parts.push(`Don't:\n${donts.map((rule) => `- ${rule.text}`).join('\n')}`);
    if (terms.length > 0) parts.push(`Glossary, which wins over everything above:\n${terms.map(termLine).join('\n')}`);
    return parts.join('\n\n');
};

/**
 * Whether a document is a voice, which nothing checks against itself.
 */
export const isVoiceDocument = (state: DraftState): boolean =>
    state.target.kind === 'global' && state.target.ref.type === 'global' && state.target.ref.name === VOICE_GLOBAL;

/**
 * The language a document is written in: a translation's, or its site's
 * source language.
 */
export const languageOf = (cms: CmsService, state: DraftState): string | null =>
    state.target.locale === SOURCE_LOCALE ? (cms.sourceLocaleOf(state.target.site) ?? null) : state.target.locale;

/**
 * Who writes in a site's voice, as an issue names them: the site's label, or
 * the CMS's `name` for Shared.
 */
export const writerOf = (cms: CmsService, site: string): string | undefined => {
    if (site !== DEFAULT_SITE) {
        const label = cms.siteInfo(site)['label'];
        return typeof label === 'string' ? label : undefined;
    }
    return cms.options.name;
};

/**
 * A field's label by path, from the definition's own fields: the label of
 * the field the path starts with.
 */
const labelFrom =
    (state: DraftState) =>
    (path: string): string => {
        const name = path.split('.')[0]!;
        const field = dataFields(state.target.definition.fields).find((candidate) => candidate.name === name);
        return (
            field?.label ??
            name
                .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
                .replace(/[_-]/g, ' ')
                .toLowerCase()
        );
    };

/**
 * The texts of a document's draft, or of its published copy without one.
 */
const draftTexts = (state: DraftState, content?: Record<string, unknown> | null) => {
    const values = content ?? state.row?.draft ?? state.row?.published ?? null;
    return values === null ? [] : textsOf(state.target.definition.fields, values);
};

/**
 * What the glossary flags in a document as its draft stands, against its
 * site's voice in its language. A translation is compared with its source's
 * published copy, or its draft before it is published. `fields` narrows it to
 * the fields given and every field inside them.
 */
export const documentGlossary = async (
    cms: CmsService,
    state: DraftState,
    options: {
        voice?: ResolvedVoice | null;
        fields?: readonly string[];
        content?: Record<string, unknown> | null;
    } = {}
): Promise<GlossaryIssue[]> => {
    if (!cms.voiceOn() || isVoiceDocument(state)) return [];
    const language = languageOf(cms, state);
    const voice = options.voice === undefined ? await resolveVoice(cms, state.target.site, language) : options.voice;
    if (voice === null || voice.glossary.length === 0) return [];
    const within = (field: string): boolean =>
        options.fields === undefined ||
        options.fields.some((path) => field === path || field.startsWith(`${path}.`) || path.startsWith(`${field}.`));
    const texts = draftTexts(state, options.content).filter((text) => within(text.field));
    if (texts.length === 0) return [];
    let source: ReturnType<typeof draftTexts> | undefined;
    if (state.target.source !== undefined) {
        const found = await cms.document(state.target.source);
        const copy = found.row?.published ?? found.row?.draft ?? null;
        source = copy === null ? [] : textsOf(found.target.definition.fields, copy).filter((text) => within(text.field));
    }
    return glossaryIssues({
        texts,
        source,
        terms: voice.glossary,
        locale: language,
        writer: writerOf(cms, state.target.site),
        labelOf: labelFrom(state),
    });
};

/**
 * The glossary terms a document's draft, or its source, holds, for the
 * model to read beside it.
 */
export const documentTerms = async (cms: CmsService, state: DraftState, voice: ResolvedVoice): Promise<VoiceTerm[]> => {
    const texts = draftTexts(state).map((text) => text.text);
    if (state.target.source !== undefined) {
        const found = await cms.document(state.target.source);
        const copy = found.row?.published ?? found.row?.draft ?? null;
        if (copy !== null) texts.push(...textsOf(found.target.definition.fields, copy).map((text) => text.text));
    }
    return termsIn(texts, voice.glossary);
};

/**
 * What the glossary flags in a document and, for a source, in each of its
 * translations. `translation` names the translation an issue is in, or is
 * `null` for the document itself.
 */
export const glossaryOfDocument = async (
    cms: CmsService,
    state: DraftState
): Promise<Array<GlossaryIssue & { translation: string | null }>> => {
    if (!cms.voiceOn() || isVoiceDocument(state) || state.row?.draft === null || state.row === undefined) return [];
    const own = (await documentGlossary(cms, state)).map((issue) => ({
        ...issue,
        translation: state.target.source === undefined ? null : state.target.locale,
    }));
    if (state.target.source !== undefined) return own;
    const languages = await cms.documentLocales(state.target.ref);
    const translated = [];
    for (const language of languages?.locales.slice(1) ?? []) {
        if (language.status === 'empty') continue;
        const translation = await cms.draftState({
            ...state.target.ref,
            locale: language.code,
        });
        translated.push(
            ...(await documentGlossary(cms, translation)).map((issue) => ({
                ...issue,
                translation: language.code,
            }))
        );
    }
    return [...own, ...translated];
};
