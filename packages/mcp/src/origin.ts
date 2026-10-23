import { localhostAllowedOrigins } from '@modelcontextprotocol/server';

const LOCALHOST_HOSTNAMES: ReadonlySet<string> = new Set(localhostAllowedOrigins());

/**
 * The text as a URL, when it is an http or https origin written exactly the
 * way a browser sends one: lowercase, no path, no trailing slash, no default
 * port. Anything else is not an origin this endpoint can match. URL parsing
 * accepts `*` in a host, which no browser sends, so it is refused here.
 */
const parseOrigin = (text: string): URL | undefined => {
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return undefined;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    if (url.hostname.includes('*')) return undefined;
    return url.origin === text ? url : undefined;
};

/**
 * Whether the text is an origin `allowedOrigins` can list.
 */
export const isOrigin = (text: string): boolean => parseOrigin(text) !== undefined;

/**
 * Whether the request's `Origin` may reach the endpoint, as the MCP Streamable
 * HTTP transport requires. A request with none passes, since clients that run
 * outside a browser, such as Claude Code, send none. A present one must be a
 * localhost origin on any port, or one of `allowed`.
 */
export const allowsOrigin = (header: string | string[] | undefined, allowed: ReadonlySet<string>): boolean => {
    if (header === undefined) return true;
    if (Array.isArray(header)) return header.length === 1 && allowsOrigin(header[0], allowed);
    const origin = parseOrigin(header);
    if (origin === undefined) return false;
    return allowed.has(origin.origin) || LOCALHOST_HOSTNAMES.has(origin.hostname);
};
