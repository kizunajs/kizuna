import { z } from 'zod';
import { db } from '../db';
import { k } from '../k';

const NoteSchema = z.object({
    id: z.string(),
    text: z.string(),
});

/**
 * The signed-in user's notes. `assistant.chat` runs them as tools.
 */
export const noteRoutes = k.routes.assistant.notes({
    list: k
        .route({
            method: 'GET',
            path: '/notes',
            auth: 'user',
            responses: {
                200: z.object({
                    notes: z.array(NoteSchema),
                }),
            },
            summary: 'List the notes the signed-in user has saved',
            tool: true,
        })
        .handler(async ({ auth }) => ({
            status: 200,
            body: {
                notes: await db.notes.findByUser(auth.user.userId),
            },
        })),
    add: k
        .route({
            method: 'POST',
            path: '/notes',
            auth: 'user',
            body: z.object({
                text: z.string().min(1),
            }),
            responses: {
                201: NoteSchema,
            },
            summary: 'Save a note for the signed-in user',
            tool: {
                needsApproval: true,
            },
        })
        .handler(async ({ auth, body }) => ({
            status: 201,
            body: await db.notes.add(auth.user.userId, body.text),
        })),
});
