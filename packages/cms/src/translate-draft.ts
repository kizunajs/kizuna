import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { CmsHttpError, type CmsService, type DraftState } from './cms.js';
import { dataFields } from './field.js';
import { sourceValueOf } from './locales.js';
import { formatRef, sourceRefOf, type DocumentRef } from './refs.js';
import type { Caller } from './rules.js';
import { translateFields, TranslationError } from './translate.js';
import { DraftPageSchema } from './wire.js';

/**
 * What the translate route answers: the draft, and the fields the model wrote.
 */
export const TranslatedDraftSchema = Kizuna.model({
    title: 'CMS.TranslatedDraft',
    schema: z.object({
        draft: DraftPageSchema,
        fields: z.array(z.string()).describe('The fields the model translated.'),
    }),
});

export const TranslateBodySchema = z
    .object({
        to: z.string().min(1).describe("The language to translate into, like 'nb'."),
        fields: z.array(z.string()).min(1).optional().describe('The fields to translate. Without it, every translated field.'),
    })
    .strict();

/**
 * A translation drafted by the model, with the fields it wrote.
 */
export interface TranslatedDraft {
    state: DraftState;
    fields: string[];
}

/**
 * Drafts the translation of a document into `to` from its published source,
 * and records the source version it came from.
 */
export const translateDraft = async (
    cms: CmsService,
    input: {
        ref: DocumentRef;
        to: string;
        fields?: readonly string[];
        caller: Caller;
        author: string;
    }
): Promise<TranslatedDraft> => {
    const model = cms.options.translate?.model;
    if (model === undefined) throw new CmsHttpError(404, { detail: 'cms() has no `translate` model.' });
    const ref: DocumentRef = {
        ...sourceRefOf(input.ref),
        locale: input.to,
    };
    const target = cms.target(ref);
    if (target.source === undefined) {
        throw new CmsHttpError(400, {
            detail: `'${input.to}' is the language '${formatRef(target.ref)}' is written in. Translate it into another.`,
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
            to: input.to,
        });
    } catch (error) {
        if (error instanceof TranslationError) throw new CmsHttpError(502, { detail: error.message });
        throw error;
    }
    const written = fields.map((field) => field.name).filter((name) => name in translated);
    if (written.length === 0) {
        throw new CmsHttpError(409, {
            detail: `'${formatRef(target.source)}' has no text to translate in the fields asked for.`,
        });
    }
    const state = await cms.update({
        ref,
        changes: translated,
        caller: input.caller,
        author: input.author,
        summary: `Translated from ${cms.sourceLocaleOf(target.site)}`,
    });
    await cms.store.recordSourceVersions(state.row!.id, Object.fromEntries(written.map((name) => [name, publishedVersion])));
    return {
        state,
        fields: written,
    };
};
