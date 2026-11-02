import type { RedirectTarget } from './storage/redirect-store.js';

/**
 * The checks an editor's redirect passes before it is stored: an address a
 * request can ask for, a target that leads nowhere else, and no way back to
 * where it started.
 */

/**
 * A stored redirect of one site, as far as the checks read it.
 */
export interface PlannedRedirect {
    id: string;
    from: string;
    to: RedirectTarget;
}

const ORIGIN = 'http://redirect.invalid';

/**
 * Why `from` cannot be a redirect's address, or `undefined` when it can. It
 * is a path with an optional query, as a request asks for it. A trailing `/`
 * never reaches the redirects, since Next sends `/about/` to `/about` first.
 */
export const fromProblem = (from: string): string | undefined => {
    if (!from.startsWith('/') || from.startsWith('//')) return `'${from}' is not a path. A redirect starts at a path like /butikker/oslo.`;
    if (/\s/.test(from)) return `'${from}' holds a space. Write it as the address bar does, like /sommer%20salg.`;
    if (from.includes('#')) return `'${from}' holds a #, which a browser never sends. Leave it out.`;
    const path = from.split('?')[0]!;
    if (path.length > 1 && path.endsWith('/'))
        return `'${from}' ends in /, which never reaches a redirect. Write it as ${path.replace(/\/+$/, '')}.`;
    return undefined;
};

/**
 * Why a target cannot be stored, or `undefined` when it can: a path on the
 * same site, or an http or https URL.
 */
export const targetProblem = (to: RedirectTarget): string | undefined => {
    if (to.type === 'path') {
        if (!to.path.startsWith('/') || to.path.startsWith('//')) return `'${to.path}' is not a path on the site. Write it like /butikker.`;
        if (/\s/.test(to.path)) return `'${to.path}' holds a space. Write it as the address bar does.`;
        return undefined;
    }
    if (to.type === 'url') {
        let url: URL;
        try {
            url = new URL(to.url);
        } catch {
            return `'${to.url}' is not a URL. Write it with https://.`;
        }
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return `'${to.url}' is not a web address. A redirect goes to https:// or http://.`;
        return undefined;
    }
    return undefined;
};

/**
 * The address a path target asks for, without the fragment the browser
 * keeps to itself, to compare with a redirect's `from`.
 */
const requestedBy = (path: string): string => {
    const url = new URL(path, ORIGIN);
    return `${url.pathname}${url.search}`;
};

const pathAsked = (to: RedirectTarget): string | undefined => (to.type === 'path' ? requestedBy(to.path) : undefined);

/**
 * What saving a redirect stores, or why it is refused. A path target that is
 * another redirect's `from` is stored as that redirect's target, so no
 * redirect leads to another, and each redirect that pointed at the saved
 * `from` points where it now goes. A save that leads back to its own `from`
 * is refused.
 */
export const planRedirect = (
    stored: readonly PlannedRedirect[],
    save: {
        /**
         * The redirect being changed, or `undefined` for a new one.
         */
        id?: string;
        from: string;
        to: RedirectTarget;
    }
):
    | {
          refusal: string;
          /**
           * The redirect already at `from`, when that is the refusal.
           */
          taken?: PlannedRedirect;
      }
    | {
          to: RedirectTarget;
          repointed: PlannedRedirect[];
      } => {
    const others = stored.filter((candidate) => candidate.id !== save.id);
    const taken = others.find((candidate) => candidate.from === save.from);
    if (taken !== undefined) {
        return {
            refusal: `${save.from} redirects already. Change that redirect, or delete it first.`,
            taken,
        };
    }
    const asked = pathAsked(save.to);
    const followed = asked === undefined ? undefined : others.find((candidate) => candidate.from === asked);
    const to = followed?.to ?? save.to;
    if (pathAsked(to) === save.from) {
        return {
            refusal:
                followed === undefined
                    ? `${save.from} cannot redirect to itself.`
                    : `${save.to.type === 'path' ? save.to.path : ''} redirects back to ${save.from}, so visitors would go round in a circle.`,
        };
    }
    return {
        to,
        repointed: others
            .filter((candidate) => pathAsked(candidate.to) === save.from)
            .map((candidate) => ({
                ...candidate,
                to,
            })),
    };
};
