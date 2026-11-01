import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import type { CmsService, Target } from './cms.js';
import { actingAgent } from './agents.js';
import { ContentEventNameSchema, DEFAULT_SITE, type ContentEventName, type ContentTrigger } from './options.js';
import { formatRef } from './refs.js';
import { sameContent } from './same-content.js';
import { SOURCE_LOCALE } from './storage/store.js';

/**
 * One thing that happened to one document, as a job a trigger names takes
 * it for its `input`.
 */
export const ContentEventSchema = Kizuna.model({
    title: 'CMS.ContentEvent',
    schema: z.object({
        event: ContentEventNameSchema,
        ref: z.string().describe('The document, like `item:articles:k3j9x2`, `global:footer` or `page:uk:frontPage@nb`.'),
        type: z.enum(['page', 'global', 'item']),
        name: z.string().describe("The page's or global's name, or the collection an item is in."),
        id: z.string().nullable().describe("An item's id, or `null` for a page or global."),
        site: z.string().nullable().describe('The site the document is its own or its values are on, or `null` for shared content.'),
        locale: z.string().nullable().describe('The language of the copy it happened to, or `null` when the CMS lists no languages.'),
        by: z.string().nullable().describe('The person who did it, or `null` when the CMS did it on its own, as when the trash empties.'),
        via: z.string().nullable().describe('The agent that did it for them, like `Claude`, or `null` for a person in the admin.'),
        at: z.iso.datetime(),
        changed: z.array(z.string()).describe('The fields a publish changed against what was live before. Empty for every other event.'),
        before: z.record(z.string(), z.unknown()).describe('What each changed field held before the publish.'),
        after: z.record(z.string(), z.unknown()).describe('What each changed field holds after it.'),
        release: z
            .object({
                id: z.string(),
                name: z.string(),
            })
            .nullable()
            .describe('The release it publishes, or is scheduled, with.'),
        schedule: z
            .object({
                action: z.enum(['publish', 'unpublish']),
                at: z.iso.datetime(),
            })
            .nullable()
            .describe('What a `scheduled` event set, and when it runs.'),
    }),
});

export type ContentEvent = z.output<typeof ContentEventSchema>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields whose value differs between two copies of a document, with what
 * each held in either.
 */
export const changesOf = (
    before: Record<string, unknown> | null | undefined,
    after: Record<string, unknown> | null | undefined
): Pick<ContentEvent, 'changed' | 'before' | 'after'> => {
    const changed: string[] = [];
    const was: Record<string, unknown> = {};
    const is: Record<string, unknown> = {};
    const left = isRecord(before) ? before : {};
    const right = isRecord(after) ? after : {};
    for (const field of new Set([...Object.keys(left), ...Object.keys(right)])) {
        if (sameContent(left[field], right[field])) continue;
        changed.push(field);
        if (left[field] !== undefined) was[field] = left[field];
        if (right[field] !== undefined) is[field] = right[field];
    }
    return {
        changed,
        before: was,
        after: is,
    };
};

/**
 * One event for one document, credited to `by` and the agent the call acts
 * through.
 */
export const contentEvent = (
    cms: CmsService,
    target: Target,
    event: ContentEventName,
    by: string | null,
    extra: Partial<Pick<ContentEvent, 'changed' | 'before' | 'after' | 'release' | 'schedule'>> = {}
): ContentEvent => {
    const ref = target.ref;
    return {
        event,
        ref: formatRef(ref),
        type: ref.type,
        name: ref.type === 'item' ? ref.collection : ref.name,
        id: ref.type === 'item' ? ref.id : null,
        site: target.site === DEFAULT_SITE ? null : target.site,
        locale: target.locale === SOURCE_LOCALE ? (cms.sourceLocaleOf(target.site) ?? null) : target.locale,
        by,
        via: by === null ? null : actingAgent(),
        at: new Date().toISOString(),
        changed: extra.changed ?? [],
        before: extra.before ?? {},
        after: extra.after ?? {},
        release: extra.release ?? null,
        schedule: extra.schedule ?? null,
    };
};

const names = (trigger: ContentTrigger, event: ContentEvent): boolean =>
    trigger.event === event.event &&
    (trigger.collection === undefined || (event.type === 'item' && event.name === trigger.collection)) &&
    (trigger.global === undefined || (event.type === 'global' && event.name === trigger.global)) &&
    (trigger.page === undefined || (event.type === 'page' && event.name === trigger.page));

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Queues the job of every trigger an event matches, after the write it
 * follows. A trigger whose `when` throws, or a job that cannot be queued,
 * is logged and the write stands. Each job is queued with a dedupe key of
 * its own per event, so a transport runs it once.
 */
export const fireContentEvents = async (cms: CmsService, events: readonly ContentEvent[]): Promise<void> => {
    const triggers = cms.options.on ?? [];
    if (triggers.length === 0) return;
    for (const event of events) {
        for (const trigger of triggers) {
            if (!names(trigger, event)) continue;
            const found = cms.contentJob(trigger.job);
            const label = `${event.event} event of '${event.ref}'`;
            if (found === undefined) {
                console.warn(`[kizuna-cms] A trigger on the ${label} names a job the config does not declare.`);
                continue;
            }
            try {
                if (trigger.when !== undefined && !trigger.when(event)) continue;
                await found.job.queue({
                    input: event,
                    dedupeKey: `${found.key}:${event.ref}:${event.event}@${event.at}`,
                });
            } catch (error) {
                console.warn(`[kizuna-cms] The job ${found.key} did not queue on the ${label}: ${messageOf(error)}`);
            }
        }
    }
};

/**
 * Refuses a trigger that names a job the config does not declare, or a
 * collection, global or page the CMS does not have.
 */
export const assertTriggers = (
    cms: CmsService,
    triggers: readonly ContentTrigger[],
    declared: { collections: readonly string[]; globals: readonly string[]; pages: readonly string[] }
): void => {
    for (const [index, trigger] of triggers.entries()) {
        const label = `cms()'s trigger ${index + 1}, on ${trigger.event}`;
        if (cms.contentJob(trigger.job) === undefined) {
            throw new Error(`${label} names a job that \`jobs\` on defineConfig does not declare. Add it there.`);
        }
        const kinds: Array<['collection' | 'global' | 'page', readonly string[]]> = [
            ['collection', declared.collections],
            ['global', declared.globals],
            ['page', declared.pages],
        ];
        for (const [kind, known] of kinds) {
            const name = trigger[kind];
            if (name !== undefined && !known.includes(name)) {
                throw new Error(`${label} names the ${kind} '${name}', which cms() does not have. It has ${known.join(', ') || 'none'}.`);
            }
        }
    }
};
