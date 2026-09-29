import { Kizuna } from 'kizunajs';
import { z } from 'zod';

/**
 * A user's id. Clients cannot pass another string in its place.
 */
export const UserId = Kizuna.brand('UserId', z.string());
