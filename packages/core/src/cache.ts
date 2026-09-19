import type { CachePolicy, ResponseHeaders, Routes } from './types.js';
import { flattenRoutes } from './handler-pipeline.js';
import { resolveResponseCache } from './generator-utils.js';

/**
 * The directives that carry a number of seconds, in the order they are written
 * to `Cache-Control`.
 */
const DELTA_SECONDS = [
    ['maxAge', 'max-age'],
    ['sharedMaxAge', 's-maxage'],
    ['staleWhileRevalidate', 'stale-while-revalidate'],
    ['staleIfError', 'stale-if-error'],
] as const satisfies readonly (readonly [string, string])[];

type ObjectPolicy = Exclude<CachePolicy, string>;

/**
 * The `Cache-Control` and `Vary` headers a cache policy sends, keyed lowercase.
 * Empty for a response that declares none.
 */
export const cacheHeaders = (cache: CachePolicy | undefined): ResponseHeaders => {
    if (cache === undefined) return {};
    if (cache === 'no-store') {
        return {
            'cache-control': 'no-store',
        };
    }
    const directives: string[] = [];
    if (cache.scope !== undefined) directives.push(cache.scope);
    if (cache.noCache) directives.push('no-cache');
    for (const [field, directive] of DELTA_SECONDS) {
        const seconds = cache[field];
        if (seconds !== undefined) directives.push(`${directive}=${seconds}`);
    }
    if (cache.mustRevalidate) directives.push('must-revalidate');
    if (cache.immutable) directives.push('immutable');

    const headers: ResponseHeaders = {};
    if (directives.length > 0) headers['cache-control'] = directives.join(', ');
    if (cache.vary && cache.vary.length > 0) headers['vary'] = cache.vary.join(', ');
    return headers;
};

const declaresNothing = (cache: ObjectPolicy): boolean =>
    cache.scope === undefined &&
    !cache.noCache &&
    !cache.mustRevalidate &&
    !cache.immutable &&
    cache.vary === undefined &&
    DELTA_SECONDS.every(([field]) => cache[field] === undefined);

/**
 * Rejects a cache policy that cannot mean what it says. Called by `defineConfig`,
 * so a bad policy fails at contract assembly rather than on the first response.
 */
export const assertValidCache = (routes: Routes): void => {
    for (const { routeKey, route } of flattenRoutes(routes)) {
        for (const [status, response] of Object.entries(route.responses)) {
            const cache = resolveResponseCache(response);
            if (cache === undefined || cache === 'no-store') continue;
            const where = `Route '${routeKey}' declares`;
            const onStatus = `on its ${status} response`;

            if (declaresNothing(cache)) {
                throw new Error(
                    `${where} an empty cache policy ${onStatus}, which sends no headers. Remove it, or say what may be cached.`
                );
            }
            for (const [field, directive] of DELTA_SECONDS) {
                const seconds = cache[field];
                if (seconds === undefined) continue;
                if (!Number.isInteger(seconds) || seconds < 0) {
                    throw new Error(
                        `${where} cache.${field} as ${seconds} ${onStatus}. ` + `${directive} is a whole number of seconds, zero or more.`
                    );
                }
            }
            if (cache.vary?.length === 0) {
                throw new Error(
                    `${where} an empty cache.vary ${onStatus}, which sends no Vary header. Name the request headers that change the response, or drop it.`
                );
            }
            if (cache.scope === 'public' && route.security !== undefined && route.security.length > 0) {
                throw new Error(
                    `${where} cache.scope 'public' ${onStatus}, but the route is behind authentication, ` +
                        `which lets a shared cache serve one caller's response to another. Use 'private'.`
                );
            }

            const fresh = cache.maxAge !== undefined || cache.sharedMaxAge !== undefined;
            if (cache.noCache && fresh) {
                throw new Error(
                    `${where} cache.noCache alongside a freshness lifetime ${onStatus}. ` +
                        `no-cache revalidates before every reuse, so RFC 9111 lets it override max-age and the lifetime never applies. Keep one.`
                );
            }
            if (cache.immutable && !fresh) {
                throw new Error(
                    `${where} cache.immutable with no cache.maxAge ${onStatus}. ` +
                        `RFC 8246 applies immutable only while a response is fresh, so with no freshness lifetime it says nothing.`
                );
            }
            for (const field of ['staleWhileRevalidate', 'staleIfError'] as const) {
                if (cache[field] !== undefined && !fresh) {
                    throw new Error(
                        `${where} cache.${field} with no cache.maxAge ${onStatus}. ` +
                            `It extends how long a response may be served once stale, and with no freshness lifetime there is nothing to go stale.`
                    );
                }
            }
        }
    }
};
