import { k } from './k';
import { routes } from './routes/index';

export const accessControl = k.accessControl(routes, {
    users: false,
    health: false,
    notifications: false,
    members: {
        '*': 'user',
        inviteMember: {
            auth: ['user', 'member'],
            requires: {
                invite: ['send'],
            },
        },
        cancelInvite: {
            auth: ['user', 'member'],
            requires: {
                invite: ['cancel'],
            },
        },
    },
    workspace: {
        '*': {
            auth: 'member',
            requires: {
                workspace: ['read'],
            },
        },
        deleteWorkspace: {
            auth: 'member',
            requires: {
                workspace: ['delete'],
            },
        },
        transfer: {
            auth: 'member',
            requires: {
                workspace: ['transfer'],
            },
        },
    },
    invites: 'inviteToken',
    assistant: false,
});
