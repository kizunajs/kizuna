import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@kizunajs-demo/sites-content/auth';

export const { GET, POST } = toNextJsHandler(auth);
