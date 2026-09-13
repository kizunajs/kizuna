import { Kizuna } from '@ts-kizuna/core';

/**
 * Every permission the demo has, grouped by what it acts on. Roles bundle
 * them, and the access control map names the one each route needs.
 */
export const permissions = Kizuna.permissions({
    workspace: ['read', 'delete', 'transfer'],
    invite: ['send', 'cancel'],
});
