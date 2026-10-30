import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import { dataFields } from './field.js';
import { sourceValueOf } from './locales.js';
import { formatRef, type DocumentRef } from './refs.js';
import { sameContent } from './same-content.js';
import type { Caller } from './rules.js';
import { translateFields, TranslationError } from './translate.js';
import { DraftPageSchema } from './wire.js';

/**
 * What the translate route answers: the draft, and the fields it changed.
 */
export const TranslatedDraftSchema = Kizuna.model({
    title: 'CMS.TranslatedDraft',
    schema: z.object({
        draft: DraftPageSchema,
        fields: z.array(z.string()).describe('The fields the translation changed. Empty when it already said the same.'),
        values: z.record(z.string(), z.unknown()).describe('The translated value of each field it changed.'),
    }),
});

export const TranslateBodySchema = z
    .object({
        fields: z.array(z.string()).min(1).optional().describe('The fields to translate. Without it, every translated field.'),
        save: z.boolean().optional().describe('False answers the translation without saving it to the draft.'),
    })
    .strict();

/**
 * A translation drafted by the model, with the fields it changed.
 */
export interface TranslatedDraft {
    state: DraftState;
    fields: string[];
    values: Record<string, unknown>;
}

/**
 * Drafts a translation from its published source, and records the source
 * version it came from. With `save: false` it answers the translation and
 * writes nothing.
 */
export const translateDraft = async (
    cms: CmsService,
    input: {
        ref: DocumentRef;
        fields?: readonly string[];
        save?: boolean;
        caller: Caller;
        author: string;
    }
): Promise<TranslatedDraft> => {
    const model = cms.options.translate?.model;
    if (model === undefined) throw new CmsHttpError(404, { detail: 'cms() has no `translate` model.' });
    const target = cms.target(input.ref);
    if (target.source === undefined) {
        throw new CmsHttpError(400, {
            detail: `Name the language to translate '${formatRef(target.ref)}' into with \`locale\`. It is written in ${cms.sourceLocaleOf(target.site)}.`,
        });
    }
    const source = await cms.document(target.source);
    const published = source.row?.published;
    const publishedVersion = source.row?.publishedVersion;
    if (published === null || published === undefined || publishedVersion === null || publishedVersion === undefined) {
        throw new CmsHttpError(409, {
            detail: `'${formatRef(target.source)}' is not published. Publish it, then translate it.`,
        });
    }
    const fields = dataFields(target.definition.fields).filter((field) => input.fields === undefined || input.fields.includes(field.name));
    for (const name of input.fields ?? []) {
        if (fields.some((field) => field.name === name)) continue;
        throw new CmsHttpError(400, {
            detail: `'${name}' is not a translated field of '${formatRef(target.source)}'.`,
        });
    }
    let translated: Record<string, unknown>;
    try {
        translated = await translateFields({
            model,
            fields,
            values: Object.fromEntries(fields.map((field) => [field.name, sourceValueOf(source.target.definition, published, field.name)])),
            from: cms.sourceLocaleOf(target.site)!,
            to: target.locale,
        });
    } catch (error) {
        if (error instanceof TranslationError) throw new CmsHttpError(502, { detail: error.message });
        throw error;
    }
    if (Object.keys(translated).length === 0) {
        throw new CmsHttpError(409, {
            detail: `'${formatRef(target.source)}' has no text to translate in the fields asked for.`,
        });
    }
    const current = (await cms.document(target.ref)).row?.draft ?? {};
    const written = fields.map((field) => field.name).filter((name) => name in translated && !sameContent(translated[name], current[name]));
    const values = Object.fromEntries(written.map((name) => [name, translated[name]]));
    if (written.length === 0 || input.save === false) {
        return {
            state: await cms.draftState(target.ref),
            fields: written,
            values,
        };
    }
    const state = await cms.update({
        ref: target.ref,
        changes: values,
        caller: input.caller,
        author: input.author,
        summary: `Translated from ${cms.sourceLocaleOf(target.site)}`,
    });
    await cms.store.recordSourceVersions(state.row!.id, Object.fromEntries(written.map((name) => [name, publishedVersion])));
    return {
        state,
        fields: written,
        values,
    };
};
