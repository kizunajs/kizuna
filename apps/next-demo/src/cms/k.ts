import { Kizuna } from 'kizunajs';
import type { Config } from './kizuna.types';

/**
 * The CMS API's own `k`, typed by the `Config` its config generates, so an
 * editor identity never reaches an app route.
 */
export const k = new Kizuna<Config>();
