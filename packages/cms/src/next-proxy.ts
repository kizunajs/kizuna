import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { matchRedirect, type RedirectTable } from './redirect-match.js';

/**
 * How often the proxy asks the CMS whether the redirects changed.
 */
const CHECK_EVERY = 10_000;

/**
 * How long a check may take before the proxy carries on with what it has.
 */
const CHECK_TIMEOUT = 5_000;

/**
 * How long a browser keeps a redirect. Without it, a browser may keep a
 * `308` for good, and renaming a page and back would loop for anyone who saw
 * the first redirect.
 */
const KEEP_FOR = 'max-age=3600';

/**
 * What {@link contentProxy} takes.
 */
export interface ContentProxyOptions {
    /**
     * Where the CMS's routes are served, like `https://cms.example.com/api`.
     */
    cms: string;
    /**
     * The site this app shows. Left out for a CMS without sites.
     */
    site?: string;
}

/**
 * One site's redirects as last fetched, checked again at most every ten
 * seconds. A check that fails keeps the table it had.
 */
class RedirectFeed {
    private table: RedirectTable | undefined;
    private etag: string | undefined;
    private checkedAt = Number.NEGATIVE_INFINITY;
    private checking: Promise<void> | undefined;

    constructor(private readonly url: string) {}

    /**
     * The table to match against. The first request waits for it, and later
     * ones get the one held while a due check runs after the response.
     */
    async current(event: Pick<NextFetchEvent, 'waitUntil'> | undefined): Promise<RedirectTable | undefined> {
        const due = Date.now() - this.checkedAt >= CHECK_EVERY;
        if (this.table === undefined) {
            if (due || this.checking !== undefined) await this.check();
            return this.table;
        }
        if (due && this.checking === undefined) event?.waitUntil(this.check());
        return this.table;
    }

    private check(): Promise<void> {
        this.checking ??= this.fetchTable().finally(() => {
            this.checking = undefined;
        });
        return this.checking;
    }

    private async fetchTable(): Promise<void> {
        try {
            const response = await fetch(this.url, {
                headers:
                    this.etag === undefined
                        ? {}
                        : {
                              'if-none-match': this.etag,
                          },
                signal: AbortSignal.timeout(CHECK_TIMEOUT),
            });
            if (response.status === 304 || !response.ok) return;
            this.table = (await response.json()) as RedirectTable;
            this.etag = response.headers.get('etag') ?? undefined;
        } catch {
            // The CMS is down or slow, so the redirects stay as they were.
        } finally {
            this.checkedAt = Date.now();
        }
    }
}

/**
 * Serves the site's redirects from `proxy.ts`, before Next renders anything,
 * so each one is a real `307` or `308`. It fetches the table from the CMS
 * and checks for changes at most every ten seconds, after the response, and
 * keeps its last table while the CMS is unreachable. Answers `undefined` for
 * a request no redirect matches, for the rest of the proxy to handle.
 *
 * @example
 * const redirects = contentProxy({
 *     cms: 'https://cms.example.com/api',
 *     site: 'uk',
 * });
 *
 * export async function proxy(request: NextRequest, event: NextFetchEvent) {
 *     return (await redirects(request, event)) ?? NextResponse.next();
 * }
 */
export const contentProxy = (options: ContentProxyOptions) => {
    const base = options.cms.replace(/\/+$/, '');
    const feed = new RedirectFeed(
        options.site === undefined ? `${base}/content/redirects` : `${base}/content/sites/${encodeURIComponent(options.site)}/redirects`
    );
    return async (request: NextRequest, event?: Pick<NextFetchEvent, 'waitUntil'>): Promise<NextResponse | undefined> => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
        const table = await feed.current(event);
        if (table === undefined) return undefined;
        const found = matchRedirect(table, request);
        if (found === undefined) return undefined;
        const response = NextResponse.redirect(found.location, found.status);
        response.headers.set('cache-control', KEEP_FOR);
        return response;
    };
};

export { matchRedirect, type RedirectMatch, type RedirectTable, type ServedRedirect } from './redirect-match.js';
