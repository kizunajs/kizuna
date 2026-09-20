/**
 * Thrown when a route returns a status the api does not declare. Declared
 * statuses come back as `data` instead.
 */
export class UndeclaredResponseError extends Error {
    readonly status: number;
    readonly body: unknown;
    readonly headers: Record<string, string>;

    constructor(routeKey: string, status: number, body: unknown, headers: Record<string, string>) {
        super(`${routeKey} responded ${status}, which its api does not declare.`);
        this.name = 'UndeclaredResponseError';
        this.status = status;
        this.body = body;
        this.headers = headers;
    }
}

/**
 * Narrows an `error` from a query or mutation to {@link UndeclaredResponseError}.
 */
export const isUndeclaredResponseError = (error: unknown): error is UndeclaredResponseError => error instanceof UndeclaredResponseError;

/**
 * Thrown by `streamOptions` when a streamed route answers a declared status that
 * does not stream, such as its `400`. The query has nothing to accumulate.
 */
export class NonStreamResponseError extends Error {
    readonly status: number;
    readonly body: unknown;
    readonly headers: Record<string, string>;

    constructor(routeKey: string, status: number, body: unknown, headers: Record<string, string>) {
        super(`${routeKey} responded ${status}, which is not its streamed status.`);
        this.name = 'NonStreamResponseError';
        this.status = status;
        this.body = body;
        this.headers = headers;
    }
}

export const isNonStreamResponseError = (error: unknown): error is NonStreamResponseError => error instanceof NonStreamResponseError;
