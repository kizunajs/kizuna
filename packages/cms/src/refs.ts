/**
 * One document the CMS stores: a page, a global, or an item of a collection.
 */
export type DocumentRef =
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
      }
    | {
          type: 'item';
          collection: string;
          id: string;
      };

/**
 * A reference as one string, the way source paths and tools carry it:
 * `page:frontPage`, `page:campaign:frontPage` on a site of its own,
 * `global:site`, `item:articles:k3j9x2`.
 */
export const formatRef = (ref: DocumentRef): string => {
    if (ref.type === 'item') return `item:${ref.collection}:${ref.id}`;
    if (ref.type === 'page' && ref.site !== undefined && ref.site !== 'default') return `page:${ref.site}:${ref.name}`;
    return `${ref.type}:${ref.name}`;
};

export const parseRef = (value: string): DocumentRef | undefined => {
    const [type, first, second, ...rest] = value.split(':');
    if (rest.length > 0 || first === undefined || first === '') return undefined;
    if ((type === 'page' || type === 'global') && second === undefined) {
        return {
            type,
            name: first,
        };
    }
    if (type === 'page' && second !== undefined && second !== '') {
        return {
            type,
            site: first,
            name: second,
        };
    }
    if (type === 'item' && second !== undefined && second !== '') {
        return {
            type,
            collection: first,
            id: second,
        };
    }
    return undefined;
};

export const sameRef = (left: DocumentRef, right: DocumentRef): boolean => formatRef(left) === formatRef(right);
