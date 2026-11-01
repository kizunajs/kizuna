import { formatRef, type CmsService, type DocumentRef } from '@kizunajs/cms';
import { mia, nils } from './seed-content';

/**
 * How Hagen writes on every site: the group's voice on Shared.
 */
const groupVoice = {
    tone: 'Hagen talks to customers the way a neighbour who knows plants would: warm, practical, and with no hype. Plain sentences that say what to do and when.',
    audience:
        'People with a balcony, a garden or a windowsill, from first plant to fiftieth. Many are unsure, so explain the why in a few words.',
    rules: [
        {
            kind: 'do',
            text: 'Name the plant, the month and the place rather than speaking in general.',
        },
        {
            kind: 'do',
            text: 'Say what to do and when: "Water when the top few centimetres of soil are dry".',
        },
        {
            kind: 'dont',
            text: 'Use exclamation marks.',
        },
        {
            kind: 'dont',
            text: 'Promise results, like guaranteed growth or plants that never die.',
        },
    ],
    glossary: [
        {
            forms: ['Hagen'],
            rule: 'keep',
            note: 'Our name, in every language.',
        },
        {
            forms: ['Kanzan'],
            rule: 'keep',
            note: "The cherry's cultivar name, part of the product's name.",
        },
        {
            forms: ['cheap', 'cheaper', 'cheapest'],
            rule: 'avoid',
            language: 'en',
            use: 'affordable',
        },
        {
            forms: ['guaranteed'],
            rule: 'avoid',
            language: 'en',
            note: 'We cannot promise how a plant grows.',
        },
    ],
};

/**
 * What Hagen Norge adds: bokmål's own rules, and its words.
 */
const norwayVoice = {
    tone: 'Bokmål, uformelt og vennlig, som i en samtale over disken.',
    audience: '',
    rules: [
        {
            kind: 'do',
            text: 'Skriv du, aldri De.',
            language: 'nb',
        },
        {
            kind: 'dont',
            text: 'Bruk engelske ord der et norsk ord finnes.',
            language: 'nb',
        },
    ],
    glossary: [
        {
            forms: ['Plantedoktoren'],
            rule: 'keep',
            note: 'The name of our advice service, untranslated in every language.',
        },
        {
            forms: ['billig', 'billige', 'billigste'],
            rule: 'avoid',
            language: 'nb',
            use: 'rimelig',
        },
        {
            forms: ['epost', 'e-mail'],
            rule: 'avoid',
            language: 'nb',
            use: 'e-post',
        },
    ],
};

/**
 * Whether a voice says nothing: no tone, audience, rules or glossary.
 */
const isEmptyVoice = (content: Record<string, unknown> | null): boolean =>
    content === null ||
    Object.values(content).every((value) => value === '' || value === undefined || (Array.isArray(value) && value.length === 0));

/**
 * Writes and publishes Hagen's group voice and Hagen Norge's, each only when
 * it is missing, so a voice an editor changed survives a restart.
 */
export const seedVoice = async (service: CmsService): Promise<void> => {
    if (!service.voiceOn()) return;
    const caller = service.caller({
        editor: {
            role: 'admin',
        },
    });
    const voices: Array<{ ref: DocumentRef; values: Record<string, unknown>; by: string }> = [
        {
            ref: {
                type: 'global',
                name: 'voice',
            },
            values: groupVoice,
            by: mia,
        },
        {
            ref: {
                type: 'global',
                site: 'norway',
                name: 'voice',
            },
            values: norwayVoice,
            by: nils,
        },
    ];
    for (const voice of voices) {
        const { row } = await service.document(voice.ref);
        // A voice saved empty and never published counts as missing, so opening one before the seed ran does not stop it.
        if (row !== undefined && (row.published !== null || !isEmptyVoice(row.draft))) continue;
        const state = await service.update({
            ref: voice.ref,
            changes: voice.values,
            caller,
            author: voice.by,
        });
        // Nothing reads a voice through a cache, so publishing goes to the store alone.
        await service.store.publish(state.target.kind, state.target.key, voice.by, state.target.site, state.target.locale);
        console.log(`[demo] seeded ${formatRef(voice.ref)}`);
    }
};
