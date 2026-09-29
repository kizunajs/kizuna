import { Kizuna } from 'kizunajs';
import { z } from 'zod';

/**
 * The token in an invite's capability URL. Clients check its shape before
 * sending it.
 */
export const InviteToken = Kizuna.brand('InviteToken', z.string().regex(/^inv_[a-z0-9]+$/)).meta({
    example: 'inv_9x2k7q',
});
