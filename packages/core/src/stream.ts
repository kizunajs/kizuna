import type { z } from 'zod';
import type { RouteDefinition, StreamDefinition, StreamResponseDefinition } from './types.js';
import { isBinarySchema, resolveBaseType } from './zod-internals.js';
import type { StreamWithTools } from './tool-events.js';
import { isJsonMediaType, isStreamResponse, isSuccessStatus, isZodSchema } from './generator-utils.js';

export interface StreamContext {
    signal: AbortSignal;
}

interface EventFields {
    id?: string;
    retry?: number;
}

export interface StreamComment {
    comment: string;
}

/**
 * What a handler yields per event, on the schema's input side.
 */
export type StreamYield<Stream extends StreamDefinition> =
    | (Stream extends z.ZodType
          ? { data: z.input<Stream> } & EventFields
          : { [Name in keyof Stream & string]: { event: Name; data: z.input<Stream[Name]> } & EventFields }[keyof Stream & string])
    | StreamComment;

/**
 * What a client reads per event, on the schema's output side.
 */
export type StreamMessage<Stream extends StreamDefinition> = Stream extends z.ZodType
    ? { data: z.output<Stream> } & EventFields
    : { [Name in keyof Stream & string]: { event: Name; data: z.output<Stream[Name]> } & EventFields }[keyof Stream & string];

type IsEventStream<Def> = Def extends { contentType: infer ContentType } ? (ContentType extends 'text/event-stream' ? true : false) : true;

export type StreamChunk<Def extends StreamResponseDefinition> =
    IsEventStream<Def> extends true ? StreamYield<StreamWithTools<Def>> : Def['stream'] extends z.ZodType ? z.input<Def['stream']> : never;

export type StreamMessageOf<Def extends StreamResponseDefinition> =
    IsEventStream<Def> extends true
        ? StreamMessage<StreamWithTools<Def>>
        : Def['stream'] extends z.ZodType
          ? z.output<Def['stream']>
          : never;

/**
 * The `body` of a streamed status: an async generator function receiving `{ signal }`, or any async iterable.
 */
export type StreamBodyOf<Def extends StreamResponseDefinition> =
    | ((context: StreamContext) => AsyncIterable<StreamChunk<Def>>)
    | AsyncIterable<StreamChunk<Def>>;

/**
 * The `body` type of one streamed status, for a generator written outside its handler.
 *
 * @example
 * ```ts
 * const cannedReply: StreamBody<typeof replyRoute, 200> = async function* () {
 *     yield {
 *         event: 'delta',
 *         data: {
 *             text: 'Hello',
 *         },
 *     };
 * };
 * ```
 */
export type StreamBody<
    R extends Pick<RouteDefinition, 'responses'>,
    Status extends keyof R['responses'],
> = R['responses'][Status] extends StreamResponseDefinition ? StreamBodyOf<R['responses'][Status]> : never;

export const EVENT_STREAM_MEDIA_TYPE = 'text/event-stream';

export type StreamMode = 'events' | 'text' | 'binary';

const mediaTypeEssence = (contentType: string): string => (contentType.split(';')[0] ?? '').trim().toLowerCase();

export const streamContentType = (definition: StreamResponseDefinition): string => definition.contentType ?? EVENT_STREAM_MEDIA_TYPE;

export const streamMode = (definition: StreamResponseDefinition): StreamMode => {
    const essence = mediaTypeEssence(streamContentType(definition));
    if (essence === EVENT_STREAM_MEDIA_TYPE) return 'events';
    if (essence.startsWith('text/')) return 'text';
    return 'binary';
};

export const isNamedStream = (stream: StreamDefinition): stream is Record<string, z.ZodType> => !isZodSchema(stream);

export const streamStatuses = (route: Pick<RouteDefinition, 'responses'>): number[] =>
    Object.entries(route.responses)
        .filter(([, response]) => isStreamResponse(response))
        .map(([status]) => Number(status));

/**
 * Whether any status of the route streams.
 */
export const routeStreams = (route: Pick<RouteDefinition, 'responses'>): boolean => streamStatuses(route).length > 0;

/**
 * The one streamed 2xx of a route with no other 2xx beside it, the shape the
 * native clients generate. `undefined` for a route that does not stream, or one
 * that mixes a stream with another success status.
 */
export const soleStreamResponse = (
    route: Pick<RouteDefinition, 'responses'>
): { status: number; definition: StreamResponseDefinition } | undefined => {
    const successes = Object.keys(route.responses).filter((status) => isSuccessStatus(Number(status)));
    const [status] = streamStatuses(route);
    if (status === undefined || successes.length !== 1) return undefined;
    return {
        status,
        definition: route.responses[status] as StreamResponseDefinition,
    };
};

export const streamSchemas = (stream: StreamDefinition): z.ZodType[] => (isNamedStream(stream) ? Object.values(stream) : [stream]);

const LINE_BREAK = /[\r\n]/;

export const assertValidStreams = (route: RouteDefinition, routeKey: string): void => {
    for (const [statusKey, response] of Object.entries(route.responses)) {
        if (!isStreamResponse(response)) continue;
        const status = Number(statusKey);
        const where = `Route "${routeKey}" declares a stream on status ${status}`;
        if (!isSuccessStatus(status)) {
            throw new Error(`${where}, but only a 2xx status can stream. An error response is one Problem Details body.`);
        }
        if ('body' in response && response.body !== undefined) {
            throw new Error(`${where} beside a body. A status is sent at once (body) or piece by piece (stream).`);
        }
        if (route.method === 'HEAD') {
            throw new Error(`${where}, but a HEAD response has no content.`);
        }
        const contentType = streamContentType(response);
        if (isJsonMediaType(contentType)) {
            throw new Error(`${where} with content type "${contentType}". JSON messages stream as text/event-stream, the default.`);
        }
        const mode = streamMode(response);
        if (mode === 'events') {
            if (!isNamedStream(response.stream)) continue;
            const names = Object.keys(response.stream);
            if (names.length === 0) {
                throw new Error(`${where} with no events. Name at least one event, or give stream a single schema.`);
            }
            for (const name of names) {
                if (name === '' || LINE_BREAK.test(name)) {
                    throw new Error(`${where} with an event name that is empty or contains a line break: ${JSON.stringify(name)}.`);
                }
            }
            continue;
        }
        if (isNamedStream(response.stream)) {
            throw new Error(`${where} with content type "${contentType}" and named events. Named events need text/event-stream.`);
        }
        if (mode === 'text' && resolveBaseType(response.stream) !== 'string') {
            throw new Error(`${where} with content type "${contentType}", so each chunk is text and its schema must be z.string().`);
        }
        if (mode === 'binary' && !isBinarySchema(response.stream)) {
            throw new Error(`${where} with content type "${contentType}", so each chunk is bytes and its schema must be BinarySchema.`);
        }
    }
};

interface EventItem {
    event?: string;
    data?: unknown;
    id?: string;
    retry?: number;
}

const splitLines = (text: string): string[] => text.split(/\r\n|\r|\n/);

const formatField = (name: string, value: string): string =>
    splitLines(value)
        .map((line) => `${name}: ${line}\n`)
        .join('');

export const formatEvent = (item: EventItem | StreamComment, named: boolean): string => {
    if ('comment' in item) {
        return (
            splitLines(item.comment)
                .map((line) => `: ${line}\n`)
                .join('') + '\n'
        );
    }
    let text = '';
    if (named) text += `event: ${item.event}\n`;
    text += formatField('data', JSON.stringify(item.data) ?? 'null');
    if (item.id !== undefined) {
        if (/[\r\n\0]/.test(item.id)) {
            throw new Error(`A server-sent event id cannot contain a line break or NUL: ${JSON.stringify(item.id)}.`);
        }
        text += `id: ${item.id}\n`;
    }
    if (item.retry !== undefined) {
        if (!Number.isInteger(item.retry) || item.retry < 0) {
            throw new Error(`A server-sent event retry is a whole number of milliseconds, got ${String(item.retry)}.`);
        }
        text += `retry: ${item.retry}\n`;
    }
    return text + '\n';
};

const describe = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'an array';
    return `a value of type ${typeof value}`;
};

const isAsyncIterable = (value: unknown): value is AsyncIterable<unknown> =>
    value !== null && typeof value === 'object' && Symbol.asyncIterator in value && typeof value[Symbol.asyncIterator] === 'function';

export interface EncodeStreamOptions {
    signal: AbortSignal;
    validate?: boolean;
    onError?: (error: unknown) => void;
}

interface StreamSource {
    routeKey: string;
    route: RouteDefinition;
    status: number;
    body: unknown;
}

const encoder = new TextEncoder();

/**
 * The bytes of a streamed response, pulled from the handler's body as the consumer reads.
 */
export const encodeStreamBody = (source: StreamSource, options: EncodeStreamOptions): ReadableStream<Uint8Array> => {
    const definition = source.route.responses[source.status];
    if (definition === undefined || !isStreamResponse(definition)) {
        throw new Error(`${source.routeKey} (status ${source.status}) does not declare a stream.`);
    }
    const mode = streamMode(definition);
    const stream = definition.stream;
    const named = isNamedStream(stream);
    const iterable =
        typeof source.body === 'function' ? (source.body as (context: StreamContext) => unknown)({ signal: options.signal }) : source.body;
    if (!isAsyncIterable(iterable)) {
        throw new Error(
            `${source.routeKey} (status ${source.status}) is declared as a stream, so its body must be an async generator function or an async iterable, but the handler returned ${describe(source.body)}.`
        );
    }
    const iterator = iterable[Symbol.asyncIterator]();

    const validate = (schema: z.ZodType, value: unknown): void => {
        if (!options.validate) return;
        const parsed = schema.safeParse(value);
        if (parsed.success) return;
        throw new Error(
            `Stream message validation failed for ${source.routeKey} (status ${source.status}): ${parsed.error.issues.map((issue) => issue.message).join('; ')}`
        );
    };

    const encode = (item: unknown): Uint8Array => {
        switch (mode) {
            case 'events': {
                if (item === null || typeof item !== 'object') {
                    throw new Error(
                        `${source.routeKey} yielded ${describe(item)}, but an event stream yields { event, data } objects or { comment }.`
                    );
                }
                if ('comment' in item) return encoder.encode(formatEvent(item as StreamComment, named));
                const event = item as EventItem;
                const schema = named ? stream[event.event ?? ''] : stream;
                if (schema === undefined) {
                    throw new Error(`${source.routeKey} yielded event ${JSON.stringify(event.event)}, which its stream does not declare.`);
                }
                validate(schema, event.data);
                return encoder.encode(formatEvent(event, named));
            }
            case 'text':
                if (typeof item !== 'string') {
                    throw new Error(`${source.routeKey} yielded ${describe(item)}, but a text stream yields strings.`);
                }
                validate(stream as z.ZodType, item);
                return encoder.encode(item);
            case 'binary':
                if (!(item instanceof Uint8Array)) {
                    throw new Error(`${source.routeKey} yielded ${describe(item)}, but a binary stream yields Uint8Array chunks.`);
                }
                validate(stream as z.ZodType, item);
                return item;
        }
    };

    const stop = (): Promise<unknown> => Promise.resolve(iterator.return?.()).catch(() => undefined);
    options.signal.addEventListener('abort', () => void stop(), {
        once: true,
    });

    return new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                const next = await iterator.next();
                if (next.done) {
                    controller.close();
                    return;
                }
                controller.enqueue(encode(next.value));
            } catch (error) {
                options.onError?.(error);
                controller.error(error);
            }
        },
        cancel() {
            return stop().then(() => undefined);
        },
    });
};
