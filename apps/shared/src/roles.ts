import { Kizuna } from '@ts-kizuna/core';
import { permissions } from './permissions';

/**
 * What each workspace role holds. Anything not listed is denied, and `'all'`
 * is every permission declared.
 */
export const roles = Kizuna.roles(permissions, {
    admin: {
        workspace: ['read'],
        invite: ['send', 'cancel'],
    },
    owner: 'all',
});
