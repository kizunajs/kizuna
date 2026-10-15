export * from './users';
export * from './health';
export * from './workspace';
export * from './notifications';
export * from './invites';
export * from './assistant';
export * from './assistant-tools';
export * from './notes';

import { usersRoutes } from './users';
import { healthRoutes } from './health';
import { workspaceRoutes } from './workspace';
import { notificationsRoutes } from './notifications';
import { inviteRoutes } from './invites';
import { assistantRoutes } from './assistant';
import { assistantTools } from './assistant-tools';
import { noteRoutes } from './notes';

export const routes = [
    usersRoutes,
    healthRoutes,
    notificationsRoutes,
    workspaceRoutes.info,
    workspaceRoutes.members,
    inviteRoutes,
    assistantRoutes,
    assistantTools,
    noteRoutes,
];
