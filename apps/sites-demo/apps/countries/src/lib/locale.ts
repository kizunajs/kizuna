import { headers } from 'next/headers';
import { LOCALE_HEADER, servedLocales } from './languages';

/**
 * The language a request is in: the one its address names, or the site's first.
 */
export const localeOf = async (): Promise<string> => (await headers()).get(LOCALE_HEADER) ?? servedLocales()[0]!;
