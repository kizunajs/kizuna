import { Kizuna } from 'kizunajs';

/**
 * Every permission the demo has, grouped by what it acts on. Roles bundle
 * them, and a route's `auth.requires` names the ones it needs.
 */
export const permissions = Kizuna.permissions({
    workspace: ['read', 'delete', 'transfer'],
    invite: ['send', 'cancel'],
});
