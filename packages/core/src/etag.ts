/**
 * The `ETag` a response body hashes to, and the `If-None-Match` comparison that
 * decides whether the caller already holds it. RFC 9110 sections 8.8.3 and
 * 13.1.2.
 */

const toHex = (bytes: Uint8Array): string => {
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
};

/**
 * A strong entity tag for the bytes that will go on the wire. The same body
 * serializes identically every time, so the tag compares byte for byte rather
 * than semantically, which is what `strong` means in RFC 9110 section 8.8.1.
 *
 * Hashes with `crypto.subtle`, available on Node, Bun, Deno, Cloudflare
 * Workers, and the Next edge runtime alike.
 */
export const computeEtag = async (body: string | Uint8Array): Promise<string> => {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    return `"${toHex(new Uint8Array(digest)).slice(0, 32)}"`;
};

/**
 * Whether an `If-None-Match` request header covers the tag we are about to
 * send. `*` matches any current representation, and a list is compared entry by
 * entry with the weak comparison RFC 9110 section 13.1.2 requires, so `W/"abc"`
 * and `"abc"` match.
 */
export const etagMatches = (ifNoneMatch: string | undefined, etag: string): boolean => {
    if (ifNoneMatch === undefined) return false;
    const candidate = ifNoneMatch.trim();
    if (candidate === '*') return true;
    const dropWeak = (tag: string) => (tag.startsWith('W/') ? tag.slice(2) : tag);
    const target = dropWeak(etag);
    return candidate.split(',').some((entry) => dropWeak(entry.trim()) === target);
};
