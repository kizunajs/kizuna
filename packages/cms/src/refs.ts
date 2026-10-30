/**
 * The language of a translation, left out for the source.
 */
interface Translated {
    /**
     * The language a translation is in, like `nb`. Left out for the source.
     */
    locale?: string;
}

/**
 * One document the CMS stores: a page, a global, or an item of a collection.
 */
export type DocumentRef = Translated &
    (
        | {
              type: 'page';
              name: string;
              /**
               * The site a page belongs to, when several Next.js apps share the
               * CMS. Left out for the default site.
               */
              site?: string;
          }
        | {
              type: 'global';
              name: string;
              /**
               * The site a global of its own belongs to. Left out for a shared
               * global.
               */
              site?: string;
          }
        | {
              type: 'item';
              collection: string;
              id: string;
              /**
               * The site an item of its own collection belongs to. Left out for
               * an item of a shared collection.
               */
              site?: string;
          }
    );

/**
 * A reference as one string, the way source paths and tools carry it:
 * `page:frontPage`, `global:footer`, `item:articles:k3j9x2`, and with the
 * site first for a site's own, `page:uk:frontPage`, `global:uk:settings` or
 * `item:uk:events:k3j9x2`. A translation adds its language, `page:frontPage@nb`.
 */
export const formatRef = (ref: DocumentRef): string => {
    const site = ref.site === undefined || ref.site === 'default' ? '' : `${ref.site}:`;
    const locale = ref.locale === undefined ? '' : `@${ref.locale}`;
    if (ref.type === 'item') return `item:${site}${ref.collection}:${ref.id}${locale}`;
    return `${ref.type}:${site}${ref.name}${locale}`;
};

const LOCALE = /^[A-Za-z][A-Za-z0-9-]*$/;

export const parseRef = (value: string): DocumentRef | undefined => {
    const at = value.lastIndexOf('@');
    if (at === -1) return parseSource(value);
    const locale = value.slice(at + 1);
    const source = parseSource(value.slice(0, at));
    return source === undefined || !LOCALE.test(locale)
        ? undefined
        : {
              ...source,
              locale,
          };
};

/**
 * The source a ref names, without a language.
 */
export const sourceRefOf = (ref: DocumentRef): DocumentRef => {
    const { locale: _, ...source } = ref;
    return source as DocumentRef;
};

const parseSource = (value: string): DocumentRef | undefined => {
    const [type, ...parts] = value.split(':');
    if (parts.some((part) => part === '')) return undefined;
    if (type === 'page' || type === 'global') {
        if (parts.length === 1) {
            return {
                type,
                name: parts[0]!,
            };
        }
        if (parts.length === 2) {
            return {
                type,
                site: parts[0]!,
                name: parts[1]!,
            };
        }
        return undefined;
    }
    if (type === 'item') {
        if (parts.length === 2) {
            return {
                type,
                collection: parts[0]!,
                id: parts[1]!,
            };
        }
        if (parts.length === 3) {
            return {
                type,
                site: parts[0]!,
                collection: parts[1]!,
                id: parts[2]!,
            };
        }
    }
    return undefined;
};

export const sameRef = (left: DocumentRef, right: DocumentRef): boolean => formatRef(left) === formatRef(right);
