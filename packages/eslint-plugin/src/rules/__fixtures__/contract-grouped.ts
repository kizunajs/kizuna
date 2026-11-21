import { Kizuna } from 'kizunajs';
import { z } from 'zod';

interface Config {
    groups: typeof groups;
}

const k = new Kizuna<Config>();

const groups = k.groups({
    users: 'Users',
    workspaces: {
        title: 'Workspaces',
        groups: {
            members: 'Members',
        },
    },
});

export const getNote = k.route({
    method: 'GET',
    path: '/notes/:id',
    query: z.object({
        page: z.coerce.number(),
    }),
    responses: {
        200: z.object({
            id: z.string(),
        }),
    },
});

export const notes = k.routes.users({
    getNote,
    listNotes: k.route({
        method: 'GET',
        path: '/notes',
        query: z.object({
            archived: z.coerce.boolean(),
        }),
        responses: {
            200: z.object({
                total: z.number(),
            }),
        },
    }),
});

export const members = k.routes.workspaces.members({
    listMembers: k.route({
        method: 'GET',
        path: '/members',
        query: z.object({
            since: z.coerce.date(),
        }),
        responses: {
            200: z.object({
                total: z.number(),
            }),
        },
    }),
});
