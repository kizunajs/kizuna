import { z } from 'zod';
import type { RouteDefinition, StreamResponseDefinition } from './types.js';
import { isStreamResponse } from './generator-utils.js';
import { isNamedStream, streamMode, streamStatuses, type StreamMessageOf } from './stream.js';
import { toolEvents } from './tool-events.js';

type StreamStatusOf<R extends Pick<RouteDefinition, 'responses'>> = {
    [Status in keyof R['responses']]: R['responses'][Status] extends StreamResponseDefinition ? Status : never;
}[keyof R['responses']];

type MessageOf<
    R extends Pick<RouteDefinition, 'responses'>,
    Status extends keyof R['responses'],
> = R['responses'][Status] extends StreamResponseDefinition ? StreamMessageOf<R['responses'][Status]> : never;

const eventFields = {
    id: z.string().optional(),
    retry: z.int().nonnegative().optional(),
};

const streamOf = (route: Pick<RouteDefinition, 'responses'>, status: number | undefined): StreamResponseDefinition => {
    if (status !== undefined) {
        const response = route.responses[status];
        if (!isStreamResponse(response)) {
            throw new Error(
                `\`streamMessageSchema\` was given status ${status}, which does not stream. Name a status that declares \`stream\`.`
            );
        }
        return response;
    }
    const statuses = streamStatuses(route);
    if (statuses.length === 0) {
        throw new Error('`streamMessageSchema` was given a route that does not stream. Give it a route that declares `stream`.');
    }
    if (statuses.length > 1) {
        throw new Error(`\`streamMessageSchema\` was given a route that streams on ${statuses.join(' and ')}. Name the status to read.`);
    }
    return route.responses[statuses[0]!] as StreamResponseDefinition;
};

/**
 * One message of a route's event stream, `{ event, data, id?, retry? }`, as the
 * clients read it. Every event the stream declares is an arm, and so is each
 * tool event its `tools` adds. Use it to check messages an app saved before it
 * replays them.
 *
 * @example
 * ```ts
 * const ReplyMessageSchema = streamMessageSchema(assistantRoutes.reply);
 *
 * const messages = z.array(ReplyMessageSchema).parse(savedMessages);
 * ```
 */
export const streamMessageSchema = <R extends Pick<RouteDefinition, 'responses'>, Status extends StreamStatusOf<R> = StreamStatusOf<R>>(
    route: R,
    status?: Status
): z.ZodType<MessageOf<R, Status>> => {
    const definition = streamOf(route, status === undefined ? undefined : Number(status));
    if (streamMode(definition) !== 'events') {
        throw new Error('`streamMessageSchema` was given a stream of raw chunks, which has no messages. Give it an event stream.');
    }

    const { stream, tools } = definition;
    if (!isNamedStream(stream)) {
        return z.object({
            data: stream,
            ...eventFields,
        }) as unknown as z.ZodType<MessageOf<R, Status>>;
    }

    const events: Record<string, z.ZodType> = {
        ...stream,
        ...(tools === undefined ? {} : (toolEvents(tools) as unknown as Record<string, z.ZodType>)),
    };
    const arms: z.ZodObject[] = Object.entries(events).map(([name, data]) =>
        z.object({
            event: z.literal(name),
            data,
            ...eventFields,
        })
    );
    const schema = arms.length === 1 ? arms[0]! : z.discriminatedUnion('event', arms as [z.ZodObject, z.ZodObject, ...z.ZodObject[]]);
    return schema as unknown as z.ZodType<MessageOf<R, Status>>;
};
