import { server } from '../server';
import { users } from './users';
import { health } from './health';
import { notifications } from './notifications';
import { members } from './members';
import { workspace } from './workspace';
import { invites } from './invites';
import { assistant } from './assistant';

export const router = server.router({
    users,
    health,
    notifications,
    members,
    workspace,
    invites,
    assistant,
});
