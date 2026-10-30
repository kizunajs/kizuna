import { Kizuna } from 'kizunajs';
import type { Config } from './kizuna.types';

/**
 * The content API's own `k`, typed by the `Config` its config generates.
 */
export const k = new Kizuna<Config>();
