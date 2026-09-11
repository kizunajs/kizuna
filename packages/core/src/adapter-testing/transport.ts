export type TestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface TestRequest {
    method: TestMethod;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
}

/**
 * A request as an adapter receives it: body already serialized, headers already carrying the content type.
 */
export interface MountRequest {
    method: TestMethod;
    path: string;
    body: string | undefined;
    headers: Record<string, string>;
}

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

const resolveRequest = ({ method, path, body, headers }: TestRequest): MountRequest => {
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
    };
};

export const toMountedApi = (transport: Transport): MountedApi => ({
    request: (request) => transport.request(resolveRequest(request)),
    stream: (request) => transport.stream(resolveRequest(request)),
    close: transport.close,
});
