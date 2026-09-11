export interface ServerSentEvent {
    event?: string;
    data: unknown;
    id?: string;
    retry?: number;
}

const parseData = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

// A lone `\r` at the end may be half of `\r\n`, so it waits for more unless the stream is over.
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
 * Parses `text/event-stream` per the WHATWG HTML specification.
 */
export async function* parseServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerSentEvent> {
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
            data: parseData(dataLines.join('\n')),
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

export async function* readTextChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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
            const text = decoder.decode(value, {
                stream: true,
            });
            if (text.length > 0) yield text;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

export async function* readByteChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
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
