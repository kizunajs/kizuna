/**
 * A request as an inject function takes it: the method, the path with its query, the headers and the body.
 */
export interface InjectedRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Uint8Array;
}

/**
 * What an inject function answers: the status, the headers and the body as a stream of chunks.
 */
export interface InjectedResponse {
    statusCode: number;
    headers: Record<string, string | string[] | number | undefined>;
    stream: () => AsyncIterable<Uint8Array | string>;
}

/**
 * A `Request` for an adapter that answers through an inject function rather than a socket.
 */
export const injectedRequestOf = async (request: Request): Promise<InjectedRequest> => {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
        headers[name] = value;
    });
    const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
    return {
        method: request.method,
        url: `${url.pathname}${url.search}`,
        headers,
        ...(hasBody
            ? {
                  body: new Uint8Array(await request.arrayBuffer()),
              }
            : {}),
    };
};

const encoder = new TextEncoder();

/**
 * The `Response` for what an inject function answered. The body streams as the handler writes it.
 */
export const responseOfInjected = (injected: InjectedResponse): Response => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(injected.headers)) {
        if (value === undefined) continue;
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
    }
    if (injected.statusCode === 204 || injected.statusCode === 304) {
        return new Response(null, {
            status: injected.statusCode,
            headers,
        });
    }
    const chunks = injected.stream()[Symbol.asyncIterator]();
    const body = new ReadableStream<Uint8Array>({
        pull: async (controller) => {
            const next = await chunks.next();
            if (next.done) {
                controller.close();
                return;
            }
            controller.enqueue(typeof next.value === 'string' ? encoder.encode(next.value) : next.value);
        },
        cancel: async () => {
            await chunks.return?.();
        },
    });
    return new Response(body, {
        status: injected.statusCode,
        headers,
    });
};
