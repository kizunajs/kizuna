/**
 * How far along one tool call is.
 */
export type ToolCallState = 'running' | 'done' | 'failed';

/**
 * The shape {@link readToolCalls} reads: whatever a stream hands back, as long
 * as each message names its event.
 */
export interface ToolCallMessage {
    event: string;
    data: unknown;
}

type MessageOf<Message extends ToolCallMessage, Event extends string> = Extract<Message, { event: Event }>;

type PayloadOf<Message extends ToolCallMessage, Event extends string> = MessageOf<Message, Event>['data'];

type FieldOf<Payload, Name, Field extends string> = Extract<Payload, { name: Name }> extends Record<Field, infer Value> ? Value : undefined;

/**
 * One tool call folded out of a message list, discriminated on `name` so
 * `input` and `output` narrow to the tool that produced them.
 *
 * `output` is present once the call answered, and `message` once it failed.
 */
export type ToolCallRecord<Message extends ToolCallMessage> = {
    [Name in PayloadOf<Message, 'tool_call'> extends { name: infer Key extends string } ? Key : never]: {
        id: string;
        name: Name;
        state: ToolCallState;
        input: FieldOf<PayloadOf<Message, 'tool_call'>, Name, 'input'>;
        output: FieldOf<PayloadOf<Message, 'tool_result'>, Name, 'output'> | undefined;
        /**
         * What the tool reported when it failed.
         */
        message: string | undefined;
    };
}[PayloadOf<Message, 'tool_call'> extends { name: infer Key extends string } ? Key : never];

interface MutableCall {
    id: string;
    name: string;
    state: ToolCallState;
    input: unknown;
    output: unknown;
    message: string | undefined;
}

const started = (id: string, name: string): MutableCall => ({
    id,
    name,
    state: 'running',
    input: undefined,
    output: undefined,
    message: undefined,
});

/**
 * Fold a stream's messages into one row per tool call, keyed by the `id` that
 * ties a call to its result.
 *
 * It reads the messages it recognises and ignores the rest, so pass the whole
 * list. A result or an error naming a call that never arrived still produces a
 * row rather than throwing.
 *
 * @example
 * ```ts
 * for await (const message of result.body) {
 *     messages.push(message);
 * }
 *
 * for (const call of readToolCalls(messages)) {
 *     console.log(call.name, call.state);
 * }
 * ```
 */
export const readToolCalls = <Message extends ToolCallMessage>(messages: Iterable<Message>): ToolCallRecord<Message>[] => {
    const calls = new Map<string, MutableCall>();

    const at = (id: string, name: string): MutableCall => {
        const existing = calls.get(id);
        if (existing) return existing;
        const call = started(id, name);
        calls.set(id, call);
        return call;
    };

    for (const message of messages) {
        const data = message.data as { id?: unknown; name?: unknown; input?: unknown; output?: unknown; message?: unknown };
        if (typeof data?.id !== 'string' || typeof data.name !== 'string') continue;

        switch (message.event) {
            case 'tool_call': {
                const call = at(data.id, data.name);
                call.input = data.input;
                break;
            }
            case 'tool_result': {
                const call = at(data.id, data.name);
                call.state = 'done';
                call.output = data.output;
                break;
            }
            case 'tool_error': {
                const call = at(data.id, data.name);
                call.state = 'failed';
                call.message = typeof data.message === 'string' ? data.message : undefined;
                break;
            }
        }
    }

    return [...calls.values()] as ToolCallRecord<Message>[];
};
