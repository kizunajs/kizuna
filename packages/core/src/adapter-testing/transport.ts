export type TestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface TestRequest {
    method: TestMethod;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
    /**
     * Sends the body in chunks with no `Content-Length`.
     */
    chunked?: true;
}

/**
 * A request as an adapter receives it: body already serialized, headers already carrying the content type.
 */
export interface MountRequest {
    method: TestMethod;
    path: string;
    body: string | undefined;
    headers: Record<string, string>;
    /**
     * Sends the body in chunks with no `Content-Length`. {@link toChunkedStream} makes the stream.
     */
    chunked?: true;
}

/**
 * Returns the text as a stream of two chunks, which a request sends with no `Content-Length`.
 */
export const toChunkedStream = (text: string): ReadableStream<Uint8Array> => {
    const bytes = new TextEncoder().encode(text);
    const middle = Math.floor(bytes.length / 2);
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes.slice(0, middle));
            controller.enqueue(bytes.slice(middle));
            controller.close();
        },
    });
};

/**
 * Sends a request to a listening server with `fetch`, for a transport whose own client can't send a chunked body.
 */
export const fetchTestRequest = async (baseUrl: string, { method, path, body, headers, chunked }: MountRequest): Promise<TestResponse> => {
    const response = await fetch(baseUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : chunked ? toChunkedStream(body) : body,
        ...(chunked
            ? {
                  duplex: 'half',
              }
            : {}),
    } as RequestInit);
    const text = await response.text();
    return {
        status: response.status,
        headers: response.headers,
        body: readTestBody(text),
        text,
    };
};

export interface TestResponse {
    status: number;
    headers: Headers;
    body: unknown;
    /**
     * Raw text, for the declared-contentType and void-body tests where the parsed body is not enough.
     */
    text: string;
}

export interface StreamedTestResponse {
    status: number;
    headers: Headers;
    body: ReadableStream<Uint8Array>;
    abort: () => void;
}

/**
 * How to talk to one mounted adapter. The only genuinely framework-specific part of a suite.
 */
export interface Transport {
    request: (request: MountRequest) => Promise<TestResponse>;
    stream: (request: MountRequest) => Promise<StreamedTestResponse>;
    close?: () => Promise<void>;
}

export interface MountedApi {
    request: (request: TestRequest) => Promise<TestResponse>;
    stream: (request: TestRequest) => Promise<StreamedTestResponse>;
    close?: () => Promise<void>;
}

export const fetchStream = async (baseUrl: string, { method, path, body, headers }: MountRequest): Promise<StreamedTestResponse> => {
    const controller = new AbortController();
    const response = await fetch(baseUrl + path, {
        method,
        body,
        headers,
        signal: controller.signal,
    });
    return streamedResponse(response, controller);
};

export const streamedResponse = (response: Response, controller: AbortController): StreamedTestResponse => ({
    status: response.status,
    headers: response.headers,
    body: response.body ?? new ReadableStream<Uint8Array>(),
    abort: () => controller.abort(),
});

const decoder = new TextDecoder();

export const readStreamText = async (body: ReadableStream<Uint8Array>): Promise<string> => {
    const reader = body.getReader();
    let text = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) return text;
        text += decoder.decode(value, {
            stream: true,
        });
    }
};

export const readStreamUntil = async (
    reader: ReadableStreamDefaultReader<Uint8Array>,
    satisfied: (text: string) => boolean
): Promise<string> => {
    let text = '';
    while (!satisfied(text)) {
        const { done, value } = await reader.read();
        if (done) throw new Error(`stream ended before the expected text arrived; got ${JSON.stringify(text)}`);
        text += decoder.decode(value, {
            stream: true,
        });
    }
    return text;
};

export const collectStreamText = async (body: ReadableStream<Uint8Array>): Promise<{ text: string; error: unknown }> => {
    const reader = body.getReader();
    let text = '';
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return { text, error: undefined };
            text += decoder.decode(value, {
                stream: true,
            });
        }
    } catch (error) {
        return { text, error };
    }
};

/**
 * Turn node's header record into `Headers`, appending each value of a repeated header such as `set-cookie`.
 */
export const nodeHeaders = (headers: Record<string, string | string[] | number | undefined>): Headers => {
    const built = new Headers();
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        for (const entry of Array.isArray(value) ? value : [value]) built.append(name, String(entry));
    }
    return built;
};

/**
 * Falls back to raw text because a framework's own error pages (Hono's 404, for one) are not JSON.
 */
export const readTestBody = (text: string): unknown => {
    if (text.length === 0) return undefined;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

const resolveRequest = ({ method, path, body, headers, chunked }: TestRequest): MountRequest => {
    if (body === undefined) {
        return {
            method,
            path,
            body: undefined,
            headers: headers ?? {},
        };
    }
    return {
        method,
        path,
        body: typeof body === 'string' ? body : JSON.stringify(body),
        // A test that sets its own content type wins, which the 415 feature relies on.
        headers: {
            'content-type': 'application/json',
            ...headers,
        },
        ...(chunked
            ? {
                  chunked,
              }
            : {}),
    };
};

export const toMountedApi = (transport: Transport): MountedApi => ({
    request: (request) => transport.request(resolveRequest(request)),
    stream: (request) => transport.stream(resolveRequest(request)),
    close: transport.close,
});
