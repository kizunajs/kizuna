/**
 * The site's draft, served to the editor inside a host that will not frame
 * the site itself. Claude runs a view on its own origin and lets it fetch and
 * load images from origins it declares, so the editor fetches the page
 * through this proxy and shows it in a frame it writes.
 *
 * The page's scripts are left out. A frame the editor writes has no address
 * on the site, and Next.js reads the page's address when it starts: finding
 * another one, it navigates there, which the host blocks, and waits forever.
 * What the editor shows is the page as the server renders it, client
 * components included in their first render.
 *
 * The proxy holds the draft-mode cookies, so the sandbox never needs a cookie
 * of the site's, and answers with CORS headers, since the editor's origin is
 * the host's. Every request carries a preview token minted for the editor.
 */

const STYLESHEET = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const SCRIPT_HINT = /<link\b[^>]*\b(?:rel=["']?modulepreload["']?|as=["']?script["']?)[^>]*>/gi;
// Content that could navigate or carry a document of its own. The editor's frame runs no script either way.
const EMBEDDED = /<(iframe|object|embed|frame|frameset)\b[\s\S]*?(?:<\/\1>|\/>|>)/gi;
const META_REFRESH = /<meta\b[^>]*http-equiv=["']?refresh["']?[^>]*>/gi;
const FONT_PRELOAD = /<link\b(?=[^>]*\bas=["']?font["']?)[^>]*>/gi;
const HREF = /\bhref=(["'])([^"']+)\1/i;
const CSS_URL = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;
const HEAD = /<head\b[^>]*>/i;
const RESOURCE_ATTR = /\b(src|poster)=(["'])([^"']*)\2/gi;
const SRCSET_ATTR = /\b(srcset|imagesrcset)=(["'])([^"']*)\2/gi;
const STYLE_ATTR = /\bstyle=(?:"([^"]*)"|'([^']*)')/gi;
const NOT_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i;

/**
 * Where the proxy is served within the CMS routes.
 */
export const PREVIEW_PROXY_PATH = '/preview/proxy';

/**
 * The proxy's absolute address on the site, which the editor fetches from.
 */
export const previewProxyUrl = (site: string, apiPath: string, base: string): string =>
    new URL(`${apiPath}${base}${PREVIEW_PROXY_PATH}`, site).toString();

export interface PreviewTarget {
    /**
     * The site's origin, `preview.url` on `cms()`.
     */
    site: string;
    /**
     * Where this proxy is served, as an absolute URL.
     */
    proxy: string;
    token: string;
}

/**
 * Where the proxy serves one of the site's URLs.
 */
export const proxied = (target: PreviewTarget, url: string, base: string = target.site): string | undefined => {
    let resolved: URL;
    try {
        resolved = new URL(url.replaceAll('&amp;', '&'), base);
    } catch {
        return undefined;
    }
    if (resolved.origin !== new URL(target.site).origin) return undefined;
    const proxy = new URL(target.proxy);
    proxy.searchParams.set('token', target.token);
    proxy.searchParams.set('path', `${resolved.pathname}${resolved.search}`);
    return proxy.toString();
};

/**
 * A stylesheet whose `url(...)`s load through the proxy, since a font loads
 * with CORS and the site does not answer it for the host's origin.
 */
export const previewStylesheet = (css: string, sheetUrl: string, target: PreviewTarget): string =>
    css.replace(CSS_URL, (whole: string, quote: string, url: string) => {
        if (url.startsWith('data:') || url.startsWith('#')) return whole;
        const through = proxied(target, url, sheetUrl);
        return through === undefined ? whole : `url(${quote}${through}${quote})`;
    });

/**
 * A URL in the page, made absolute against the page's own address.
 */
const absolute = (url: string, pageUrl: string): string => {
    if (url === '' || NOT_RELATIVE.test(url)) return url;
    try {
        return new URL(url, pageUrl).toString();
    } catch {
        return url;
    }
};

/**
 * A `srcset` with each candidate's URL made absolute, read the way browsers
 * read it, so a comma inside a URL stays part of it.
 */
const absoluteSrcset = (value: string, pageUrl: string): string => {
    const candidates: string[] = [];
    let at = 0;
    while (at < value.length) {
        while (at < value.length && /[\s,]/.test(value[at]!)) at++;
        if (at >= value.length) break;
        let end = at;
        while (end < value.length && !/\s/.test(value[end]!)) end++;
        let url = value.slice(at, end);
        at = end;
        let descriptor = '';
        if (url.endsWith(',')) {
            url = url.replace(/,+$/, '');
        } else {
            let stop = at;
            while (stop < value.length && value[stop] !== ',') stop++;
            descriptor = value.slice(at, stop).trim();
            at = stop;
        }
        const resolved = absolute(url, pageUrl);
        candidates.push(descriptor === '' ? resolved : `${resolved} ${descriptor}`);
    }
    return candidates.join(', ');
};

/**
 * The page's images, posters and inline-style URLs made absolute. A host's
 * `base-uri` can refuse the `<base>`: Claude's sandbox sends `base-uri 'none'`,
 * which the editor's frame inherits, and a relative image would then load from
 * the host instead of the site.
 */
const absoluteResources = (html: string, pageUrl: string): string =>
    html
        .replace(RESOURCE_ATTR, (_whole, name: string, quote: string, url: string) => `${name}=${quote}${absolute(url, pageUrl)}${quote}`)
        .replace(
            SRCSET_ATTR,
            (_whole, name: string, quote: string, value: string) => `${name}=${quote}${absoluteSrcset(value, pageUrl)}${quote}`
        )
        .replace(STYLE_ATTR, (_whole, double: string | undefined, single: string | undefined) => {
            const quote = double === undefined ? "'" : '"';
            const style = (double ?? single ?? '').replace(CSS_URL, (whole: string, inner: string, url: string) =>
                url.startsWith('data:') ? whole : `url(${inner}${absolute(url, pageUrl)}${inner})`
            );
            return `style=${quote}${style}${quote}`;
        });

/**
 * The page as the editor shows it: its scripts, embedded documents and
 * refreshes left out, its images and other resources at absolute URLs on the
 * site, a `<base>` for anything else relative, and its stylesheets and fonts
 * through the proxy. The editor's frame is sandboxed without scripts, so
 * nothing left in the page can run either.
 */
export const previewDocument = (html: string, pageUrl: string, target: PreviewTarget): string => {
    const throughProxy = (link: string): string =>
        link.replace(HREF, (whole, quote: string, href: string) => {
            const through = proxied(target, href, pageUrl);
            return through === undefined ? whole : `href=${quote}${through.replaceAll('&', '&amp;')}${quote}`;
        });
    const rewritten = absoluteResources(
        html
            .replace(SCRIPT, '')
            .replace(SCRIPT_HINT, '')
            .replace(EMBEDDED, '')
            .replace(META_REFRESH, '')
            .replace(STYLESHEET, throughProxy)
            .replace(FONT_PRELOAD, throughProxy),
        pageUrl
    );
    const base = `<base href="${new URL('/', target.site).toString()}">`;
    return HEAD.test(rewritten) ? rewritten.replace(HEAD, (open) => `${open}${base}`) : `${base}${rewritten}`;
};

/**
 * The cookies a response sets, as a `Cookie` header sends them back.
 */
const cookiesSet = (response: Response): string =>
    response.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .filter((pair): pair is string => pair !== undefined && pair.includes('='))
        .join('; ');

/**
 * Draft-mode cookies per preview token, kept for the token's life so a page
 * and everything it loads open draft mode once.
 */
const jars = new Map<string, { cookie: string; expires: number }>();

const draftCookies = async (target: PreviewTarget, draftPath: string, ttlMs: number): Promise<string> => {
    const now = Date.now();
    for (const [token, jar] of jars) if (jar.expires <= now) jars.delete(token);
    const held = jars.get(target.token);
    if (held !== undefined) return held.cookie;
    const link = new URL(draftPath, target.site);
    link.searchParams.set('token', target.token);
    link.searchParams.set('redirect', '/');
    const entered = await fetch(link, {
        redirect: 'manual',
        cache: 'no-store',
    });
    const cookie = cookiesSet(entered);
    if (cookie === '') throw new Error(`The site did not open draft mode (${entered.status}).`);
    jars.set(target.token, {
        cookie,
        expires: now + ttlMs,
    });
    return cookie;
};

/**
 * Headers every proxied answer carries: any origin may read it, since the
 * token in its URL is what grants it.
 */
export const PROXY_CORS: Record<string, string> = {
    'access-control-allow-origin': '*',
    // The token rides in the URL, so it must not leave in a Referer.
    'referrer-policy': 'no-referrer',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
};

const FORWARDED_HEADERS = ['accept', 'accept-language', 'range'];

/**
 * One of the site's URLs, fetched in draft mode and made fit for the editor's
 * frame: a page loses its scripts and gains a base, a stylesheet loads its
 * URLs through the proxy, and anything else passes as it is.
 */
export const proxyToSite = async (input: {
    target: PreviewTarget;
    draftPath: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
    ttlMs: number;
    /**
     * The editor is loading a page to show. Anything but HTML is refused, and
     * its body never downloads.
     */
    document?: boolean;
}): Promise<Response> => {
    const url = new URL(input.path, input.target.site);
    if (url.origin !== new URL(input.target.site).origin) {
        return new Response('The proxy serves the site only.', {
            status: 400,
            headers: PROXY_CORS,
        });
    }
    const cookie = await draftCookies(input.target, input.draftPath, input.ttlMs);
    const forwarded: Record<string, string> = {
        cookie,
    };
    for (const name of FORWARDED_HEADERS) {
        const value = input.headers[name];
        if (typeof value === 'string') forwarded[name] = value;
    }
    const upstream = await fetch(url, {
        headers: forwarded,
        cache: 'no-store',
    });
    const type = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const finalUrl = upstream.url || url.toString();
    if (input.document === true && !type.includes('text/html')) {
        await upstream.body?.cancel();
        return new Response(null, {
            status: 415,
            headers: {
                ...PROXY_CORS,
                'x-kizuna-preview-type': type.split(';')[0]!.trim(),
                'x-kizuna-preview-path': new URL(finalUrl).pathname,
                'access-control-expose-headers': 'x-kizuna-preview-type, x-kizuna-preview-path',
            },
        });
    }
    const headers: Record<string, string> = {
        ...PROXY_CORS,
        'content-type': type,
        'cache-control': url.pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-store',
        'x-kizuna-preview-path': new URL(finalUrl).pathname,
        'access-control-expose-headers': 'x-kizuna-preview-path',
    };
    if (type.includes('text/html')) {
        return new Response(previewDocument(await upstream.text(), finalUrl, input.target), {
            status: upstream.status,
            headers,
        });
    }
    if (type.includes('text/css')) {
        return new Response(previewStylesheet(await upstream.text(), finalUrl, input.target), {
            status: upstream.status,
            headers,
        });
    }
    return new Response(await upstream.arrayBuffer(), {
        status: upstream.status,
        headers,
    });
};
