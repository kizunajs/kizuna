/**
 * The code every generated client runs, written into the file below its route
 * table. It imports nothing, so a client installs nothing, and it always comes
 * from the release that wrote the table it reads.
 */
export const runtimeSource = String.raw`/**
 * What the client knows about one response: nothing for a body it reads as
 * JSON, the media type for one that streams.
 */
export type GeneratedResponse =
    | Record<string, never>
    | {
          stream: true;
          contentType: string;
      };

/**
 * One route in the table: how to reach it, and how to read each status it
 * answers with.
 */
export interface GeneratedRoute {
    method: string;
    path: string;
    contentType?: string;
    responses: Record<number, GeneratedResponse>;
}

/**
 * The route table, nested the way the client is.
 */
export interface GeneratedRoutes {
    [key: string]: GeneratedRoutes | GeneratedRoute;
}

/**
 * The request onRequest receives before it is sent. A header set on headers
 * is sent with it.
 */
export interface OutgoingRequest {
    url: string;
    method: string;
    headers: Headers;
    route: GeneratedRoute;
}

/**
 * Where the client sends its requests, and what it adds to each one.
 */
export interface ClientConfig {
    baseUrl: string;
    baseHeaders?: Record<string, string>;
    credentials?: RequestCredentials;
    fetch?: typeof fetch;
    onRequest?: (request: OutgoingRequest) => void | Promise<void>;
}

/**
 * One method on the client. Its '~route' names the method it sends and
 * whether its response streams, so a wrapper like @kizunajs/tanstack-query
 * reads both off the client.
 */
export type ClientMethod<Method extends string, Streams extends boolean, Args, Result> = ({} extends Args
    ? (args?: Args) => Promise<Result>
    : (args: Args) => Promise<Result>) & {
    readonly '~route': GeneratedRoute & {
        readonly method: Method;
        readonly streams: Streams;
    };
};

interface CallArgs {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    headers?: Record<string, string | undefined>;
    fetchOptions?: RequestInit;
}

/**
 * Dates go on the wire as ISO 8601, everything else as String gives it.
 */
const serializeValue = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

const buildPath = (path: string, params: Record<string, unknown> = {}): string =>
    path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined) throw new Error('Missing path parameter: ' + name);
        return encodeURIComponent(serializeValue(value));
    });

/**
 * An array repeats its key, and an undefined or null field is left out.
 */
const buildSearchParams = (fields: Record<string, unknown>): URLSearchParams => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) params.append(key, serializeValue(item));
    }
    return params;
};

const buildFormData = (fields: Record<string, unknown>): FormData => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        for (const item of Array.isArray(value) ? value : [value]) {
            if (item instanceof Blob) formData.append(key, item);
            else if (item !== undefined && item !== null) formData.append(key, typeof item === 'string' ? item : JSON.stringify(item));
        }
    }
    return formData;
};

/**
 * A multipart body leaves Content-Type to fetch, which adds the boundary.
 */
const encodeBody = (route: GeneratedRoute, body: unknown, headers: Headers): BodyInit => {
    switch (route.contentType) {
        case 'multipart/form-data':
            return body instanceof FormData ? body : buildFormData(body as Record<string, unknown>);
        case 'application/x-www-form-urlencoded':
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded');
            return buildSearchParams(body as Record<string, unknown>);
        default:
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
            return JSON.stringify(body);
    }
};

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

interface ServerSentEvent {
    event?: string;
    data: unknown;
    id?: string;
    retry?: number;
}

/**
 * A lone carriage return at the end may be half of CRLF, so it waits for more
 * unless the stream is over.
 */
const findLineEnd = (buffer: string, final: boolean): { index: number; length: number } | undefined => {
    for (let index = 0; index < buffer.length; index += 1) {
        const character = buffer[index];
        if (character === '\n') return { index, length: 1 };
        if (character === '\r') {
            if (index + 1 < buffer.length) return { index, length: buffer[index + 1] === '\n' ? 2 : 1 };
            if (final) return { index, length: 1 };
            return undefined;
        }
    }
    return undefined;
};

/**
 * Reads text/event-stream as the WHATWG HTML specification parses it.
 */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerSentEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let first = true;
    let dataLines: string[] = [];
    let eventType = '';
    let lastEventId = '';
    let retry: number | undefined;

    const dispatch = (): ServerSentEvent | undefined => {
        if (dataLines.length === 0) {
            eventType = '';
            return undefined;
        }
        const message: ServerSentEvent = {
            data: parseJson(dataLines.join('\n')),
        };
        if (eventType !== '') message.event = eventType;
        if (lastEventId !== '') message.id = lastEventId;
        if (retry !== undefined) message.retry = retry;
        dataLines = [];
        eventType = '';
        retry = undefined;
        return message;
    };

    const processLine = (line: string): ServerSentEvent | undefined => {
        if (line === '') return dispatch();
        if (line.startsWith(':')) return undefined;
        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? '' : line.slice(separator + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        switch (field) {
            case 'event':
                eventType = value;
                break;
            case 'data':
                dataLines.push(value);
                break;
            case 'id':
                if (!value.includes('\0')) lastEventId = value;
                break;
            case 'retry':
                if (/^\d+$/.test(value)) retry = Number(value);
                break;
        }
        return undefined;
    };

    try {
        for (;;) {
            const { done, value } = await reader.read();
            let chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (first && chunk.length > 0) {
                if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
                first = false;
            }
            buffer += chunk;
            for (;;) {
                const lineEnd = findLineEnd(buffer, done);
                if (lineEnd === undefined) break;
                const line = buffer.slice(0, lineEnd.index);
                buffer = buffer.slice(lineEnd.index + lineEnd.length);
                const message = processLine(line);
                if (message !== undefined) yield message;
            }
            if (done) return;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

async function* readText(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                const tail = decoder.decode();
                if (tail.length > 0) yield tail;
                return;
            }
            const text = decoder.decode(value, { stream: true });
            if (text.length > 0) yield text;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

async function* readBytes(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

const readStream = (body: ReadableStream<Uint8Array>, contentType: string): AsyncIterable<unknown> => {
    const essence = (contentType.split(';')[0] ?? '').trim().toLowerCase();
    if (essence === 'text/event-stream') return readEvents(body);
    if (essence.startsWith('text/')) return readText(body);
    return readBytes(body);
};

const buildMethod = (route: GeneratedRoute, config: ClientConfig) => {
    const call = async (args: CallArgs = {}) => {
        const query = args.query === undefined ? '' : buildSearchParams(args.query).toString();
        const url = config.baseUrl + buildPath(route.path, args.params) + (query.length > 0 ? '?' + query : '');
        const headers = new Headers(config.baseHeaders);
        for (const [name, value] of Object.entries(args.headers ?? {})) {
            if (value !== undefined) headers.set(name, value);
        }
        const init: RequestInit = {
            method: route.method,
            headers,
        };
        if (args.body !== undefined) init.body = encodeBody(route, args.body, headers);
        if (config.credentials !== undefined) init.credentials = config.credentials;
        await config.onRequest?.({
            url,
            method: route.method,
            headers,
            route,
        });

        const response = await (config.fetch ?? fetch)(url, {
            ...init,
            ...args.fetchOptions,
        });
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, name) => {
            responseHeaders[name] = value;
        });
        const declared = route.responses[response.status];
        if (declared !== undefined && 'stream' in declared && response.body !== null) {
            return {
                status: response.status,
                body: readStream(response.body, declared.contentType),
                headers: responseHeaders,
            };
        }
        const text = await response.text();
        return {
            status: response.status,
            body: text.length > 0 ? parseJson(text) : undefined,
            headers: responseHeaders,
        };
    };
    const streams = Object.values(route.responses).some((response) => 'stream' in response);
    return Object.defineProperty(call, '~route', {
        value: {
            ...route,
            streams,
        },
    });
};

const isRoute = (node: GeneratedRoutes | GeneratedRoute): node is GeneratedRoute => typeof node['method'] === 'string';

const buildTree = (routes: GeneratedRoutes, config: ClientConfig): Record<string, unknown> => {
    const tree: Record<string, unknown> = {};
    for (const [key, node] of Object.entries(routes)) {
        tree[key] = isRoute(node) ? buildMethod(node, config) : buildTree(node, config);
    }
    return tree;
};

/**
 * Sends the request context headers with every request. An explicit
 * baseHeaders entry wins.
 */
const buildClient = (routes: GeneratedRoutes, config: ClientConfig & { requestContext?: object }): Record<string, unknown> => {
    const contextHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(config.requestContext ?? {})) {
        if (value !== undefined) contextHeaders[name] = String(value);
    }
    return buildTree(routes, {
        ...config,
        baseHeaders: {
            ...contextHeaders,
            ...config.baseHeaders,
        },
    });
};
`;
