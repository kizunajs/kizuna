import type { z } from 'zod';
import type { UserSchema } from './routes/users';

/**
 * A stored user, as a database hands it back: its id is a plain string.
 */
export type User = z.input<typeof UserSchema>;
