import { Kizuna } from 'kizunajs';
import { BinarySchema, FileSchema } from 'kizunajs/schemas';
import { z } from 'zod';
import { NoteSearch } from './shared-schemas.js';

const k = new Kizuna();

export const routes = k.routes({
    listNotes: k.route({
        method: 'GET',
        path: '/folders/:folder/notes',
        pathParams: z.object({
            folder: z.array(z.string()),
        }),
        query: z.object({
            filter: z.object({
                status: z.string(),
            }),
            tags: z.array(z.string()).optional(),
            sort: z.enum(['newest', 'oldest']),
            since: z.iso.datetime().optional(),
            grid: z.array(z.array(z.string())),
        }),
        headers: z.object({
            'x-workspace': z.array(z.string()),
            'x-request-id': z.string().optional(),
        }),
        responses: {
            200: z.object({
                notes: z.array(
                    z.object({
                        id: z.string(),
                    })
                ),
            }),
        },
    }),
    searchNotes: k.route({
        method: 'GET',
        path: '/notes/search',
        query: NoteSearch,
        responses: {
            204: z.void(),
        },
    }),
    uploadAvatar: k.route({
        method: 'POST',
        path: '/avatar',
        contentType: 'multipart/form-data',
        body: z.object({
            file: BinarySchema,
            photos: z.array(FileSchema),
            labels: z.record(z.string(), z.string()),
            caption: z.string().optional(),
        }),
        responses: {
            204: z.void(),
        },
    }),
    submitFeedback: k.route({
        method: 'POST',
        path: '/feedback',
        contentType: 'application/x-www-form-urlencoded',
        body: z.object({
            attachment: FileSchema,
            rating: z.int(),
        }),
        responses: {
            204: z.void(),
        },
    }),
    createNote: k.route({
        method: 'POST',
        path: '/notes',
        body: z.object({
            filter: z.object({
                status: z.string(),
            }),
        }),
        responses: {
            204: z.void(),
        },
    }),
});
