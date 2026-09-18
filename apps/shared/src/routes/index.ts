export * from './users';
export * from './health';
export * from './workspace';
export * from './notifications';
export * from './invites';
export * from './assistant';
export * from './assistant-tools';

import { usersRoutes } from './users';
import { healthRoutes } from './health';
import { workspaceRoutes } from './workspace';
import { notificationsRoutes } from './notifications';
import { inviteRoutes } from './invites';
import { assistantRoutes } from './assistant';
import { assistantTools } from './assistant-tools';

export const routes = {
    users: usersRoutes,
    health: healthRoutes,
    notifications: notificationsRoutes,
    members: workspaceRoutes.members,
    workspace: workspaceRoutes.info,
    invites: inviteRoutes,
    assistant: assistantRoutes,
    tools: assistantTools,
};
