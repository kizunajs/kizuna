import { expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { ContentEventSchema } from './content-events.js';
import type { ContentEventJob, ContentTrigger } from './options.js';

const k = new Kizuna();

const jobs = k.jobs({
    announceArticle: k
        .job({
            input: ContentEventSchema,
        })
        .handler(() => undefined),
    indexUser: k
        .job({
            input: z.object({
                userId: z.string(),
            }),
        })
        .handler(() => undefined),
    sendDigests: k.job({}).handler(() => undefined),
});

it('takes a job whose input is the content event', () => {
    expectTypeOf(jobs.announceArticle).toExtend<ContentEventJob>();
});

it('refuses a job with another input, or none', () => {
    expectTypeOf(jobs.indexUser).not.toExtend<ContentEventJob>();
    expectTypeOf(jobs.sendDigests).not.toExtend<ContentEventJob>();
});

it('hands `when` the event', () => {
    expectTypeOf<Parameters<NonNullable<ContentTrigger['when']>>[0]['changed']>().toEqualTypeOf<string[]>();
});
