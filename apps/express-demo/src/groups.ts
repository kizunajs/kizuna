import { groups as sharedGroups } from '@kizunajs-demo/shared';
import { k } from './k';

/**
 * The shared groups, plus this demo's own.
 */
export const groups = k.groups({
    ...sharedGroups.declared,
    diagnostics: 'Diagnostics',
    contact: 'Contact',
    newsletter: 'Newsletter',
});
