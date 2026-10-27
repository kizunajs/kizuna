import { z } from 'zod';

export const CleanQuery = z.object({
    page: z.number(),
});

export const CoercedQuery = z.object({
    page: z.coerce.number(),
});

export const NestedCoerced = z.object({
    filter: CoercedQuery,
});

export const NoteSearch = z.object({
    filter: z.object({
        status: z.string(),
    }),
});
