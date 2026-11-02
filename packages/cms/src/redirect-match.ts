/**
 * One redirect as a site's table serves it: `from` is the path a visitor
 * asks for, with a query when the old address had one, and `to` is a path on
 * the site or an absolute URL.
 */
export interface ServedRedirect {
    from: string;
    to: string;
    status: 307 | 308;
}

/**
 * A site's redirects, as `GET /content/sites/:site/redirects` answers them.
 * `version` moves on with every change, and is the response's `ETag`.
 */
export interface RedirectTable {
    version: number;
    redirects: readonly ServedRedirect[];
}

/**
 * Where a request is sent, and with which status.
 */
export interface RedirectMatch {
    /**
     * The absolute URL for the `Location` header.
     */
    location: string;
    status: 307 | 308;
}

interface QueryRedirect {
    path: string;
    params: ReadonlyArray<[string, string]>;
    redirect: ServedRedirect;
}

interface RedirectIndex {
    paths: Map<string, ServedRedirect>;
    queries: QueryRedirect[];
}

const indexes = new WeakMap<RedirectTable, RedirectIndex>();

const indexOf = (table: RedirectTable): RedirectIndex => {
    const found = indexes.get(table);
    if (found !== undefined) return found;
    const index: RedirectIndex = {
        paths: new Map(),
        queries: [],
    };
    for (const redirect of table.redirects) {
        const question = redirect.from.indexOf('?');
        if (question === -1) {
            index.paths.set(redirect.from, redirect);
            continue;
        }
        index.queries.push({
            path: redirect.from.slice(0, question),
            params: [...new URLSearchParams(redirect.from.slice(question + 1))],
            redirect,
        });
    }
    // The redirect that asks for the most parameters is tried first.
    index.queries.sort((left, right) => right.params.length - left.params.length);
    indexes.set(table, index);
    return index;
};

/**
 * The target with the request's query carried over, except the parameters
 * the redirect's own `from` asked for. A parameter the target sets keeps its
 * value.
 */
const locationOf = (redirect: ServedRedirect, url: URL, asked: ReadonlyArray<[string, string]>): string => {
    const location = new URL(redirect.to, url);
    const own = new Set(location.searchParams.keys());
    for (const [name, value] of url.searchParams) {
        if (own.has(name) || asked.some(([askedName, askedValue]) => askedName === name && askedValue === value)) continue;
        location.searchParams.append(name, value);
    }
    return location.toString();
};

/**
 * The redirect a request meets in a site's table, or `undefined`. Paths
 * match exactly and by case, as RFC 3986 compares them, so `/about` and
 * `/about/` differ. The query is left out of the match and carried to the
 * target, except that a `from` with a query matches only requests carrying
 * those parameters, and is tried first. Only `GET` and `HEAD` are redirected.
 *
 * @example
 * const found = matchRedirect(table, request);
 * if (found !== undefined) return Response.redirect(found.location, found.status);
 */
export const matchRedirect = (table: RedirectTable, request: { method: string; url: string }): RedirectMatch | undefined => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
    const index = indexOf(table);
    const url = new URL(request.url);
    for (const candidate of index.queries) {
        if (candidate.path !== url.pathname) continue;
        if (!candidate.params.every(([name, value]) => url.searchParams.getAll(name).includes(value))) continue;
        return {
            location: locationOf(candidate.redirect, url, candidate.params),
            status: candidate.redirect.status,
        };
    }
    const found = index.paths.get(url.pathname);
    if (found === undefined) return undefined;
    return {
        location: locationOf(found, url, []),
        status: found.status,
    };
};
