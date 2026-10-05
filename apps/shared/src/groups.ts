import { k } from './k';

export const groups = k.groups({
    health: {
        title: 'Health',
        description: 'Service health and uptime monitoring',
    },
    users: {
        title: 'Users',
        description: 'User management endpoints',
    },
    notifications: 'Notifications',
    workspace: {
        title: 'Workspace',
        groups: {
            members: 'Members',
            invites: {
                title: 'Invites',
                description: 'Invite capability URLs, guarded by a path-token custom identity',
            },
        },
    },
    assistant: {
        title: 'Assistant',
        description: 'Replies that stream as server-sent events, and the notes an assistant keeps for the signed-in user',
        groups: {
            tools: 'Assistant tools',
            notes: 'Notes',
        },
    },
});
