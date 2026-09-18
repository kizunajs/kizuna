import { k } from './k';

export const tags = k.tags({
    health: {
        title: 'Health',
        description: 'Service health and uptime monitoring',
    },
    users: {
        title: 'Users',
        description: 'User management endpoints',
    },
    notifications: {
        title: 'Notifications',
    },
    members: {
        title: 'Members',
    },
    workspace: {
        title: 'Workspace',
    },
    invites: {
        title: 'Invites',
        description: 'Invite capability URLs, guarded by a path-token custom identity',
    },
    assistant: {
        title: 'Assistant',
        description: 'A reply that streams as server-sent events',
    },
});
