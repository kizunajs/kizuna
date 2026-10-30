import { sites } from '@kizunajs-demo/sites-content';

/**
 * The request header the proxy names the language of a prefixed address in.
 */
export const LOCALE_HEADER = 'x-hagen-locale';

/**
 * The languages this deployment serves. The first sits at the root, and each
 * other under its code, like `/en`.
 */
export const servedLocales = (): readonly string[] => sites.values[process.env.KIZUNA_SITE as keyof typeof sites.values]?.locales ?? ['en'];

/**
 * A path in a language: the site's first at the root, any other under its code.
 */
export const pathIn = (locale: string, path: string): string =>
    locale === servedLocales()[0] ? path : `/${locale}${path === '/' ? '' : path}`;
