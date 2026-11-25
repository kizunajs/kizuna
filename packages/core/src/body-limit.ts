import type { RouteDefinition } from './types.js';
import { isVoidSchema } from './zod-internals.js';

/**
 * The most bytes a request body may hold when neither the route nor the config sets `bodyLimit`.
 */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * Thrown when a request body is larger than its route's `bodyLimit`. Kizuna answers it with `413 Content Too Large`.
 */
export class ContentTooLargeError extends Error {
    constructor(readonly limit: number) {
        super(`The request body is larger than ${limit} bytes.`);
        this.name = 'ContentTooLargeError';
    }
}

/**
 * Returns the most bytes a route's request body may hold: its own `bodyLimit`, else the config's, else 1 MiB.
 */
export const bodyLimitOf = (route: RouteDefinition, configBodyLimit: number | undefined): number =>
    route.bodyLimit ?? configBodyLimit ?? DEFAULT_BODY_LIMIT;

/**
 * Returns whether kizuna reads a body for the route.
 */
export const hasRequestBody = (route: RouteDefinition): boolean =>
    route.rawBody === true || (route.body !== undefined && !isVoidSchema(route.body));

/**
 * Returns why a request's body is refused before any of it is read, from its headers alone.
 */
export const checkBodyHeaders = (
    route: RouteDefinition,
    headers: Record<string, string | string[] | undefined>,
    limit: number
): { kind: 'content-too-large'; limit: number } | { kind: 'unsupported-content-coding'; coding: string } | undefined => {
    if (!hasRequestBody(route)) return undefined;
    const coding = String(headers['content-encoding'] ?? '')
        .trim()
        .toLowerCase();
    if (coding !== '' && coding !== 'identity') {
        return {
            kind: 'unsupported-content-coding',
            coding,
        };
    }
    const declared = Number(headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
        return {
            kind: 'content-too-large',
            limit,
        };
    }
    return undefined;
};

/**
 * Reads a body stream up to `limit` bytes, and throws {@link ContentTooLargeError} at the first byte past it.
 */
export const readBodyBytes = async (body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array<ArrayBuffer>> => {
    if (body === null) return new Uint8Array();
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > limit) {
            await reader.cancel();
            throw new ContentTooLargeError(limit);
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
};

/**
 * Reads a Fetch request's body as text, up to `limit` bytes.
 */
export const readBodyText = async (request: Request, limit: number): Promise<string> =>
    new TextDecoder().decode(await readBodyBytes(request.body, limit));
