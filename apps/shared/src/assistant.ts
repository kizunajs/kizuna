import { randomUUID } from 'node:crypto';

export async function* replyWords(prompt: string, signal: AbortSignal): AsyncGenerator<string> {
    const words = `You asked: ${prompt}. A streamed reply reaches the client one piece at a time, as this one does.`.split(' ');
    for (const [index, word] of words.entries()) {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 25);
            signal.addEventListener(
                'abort',
                () => {
                    clearTimeout(timer);
                    resolve();
                },
                {
                    once: true,
                }
            );
        });
        if (signal.aborted) return;
        yield index === 0 ? word : ` ${word}`;
    }
}

export const countWords = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length;

/**
 * A stand-in for a real weather service, so the demo tool has something to
 * answer with.
 */
export const forecastFor = (
    city: string,
    unit: 'celsius' | 'fahrenheit'
): { temperature: number; unit: 'celsius' | 'fahrenheit'; summary: string } => {
    const seed = [...city].reduce((total, character) => total + character.charCodeAt(0), 0);
    const celsius = (seed % 30) - 5;
    const summary = celsius < 0 ? 'freezing' : celsius < 10 ? 'cold' : celsius < 20 ? 'mild' : 'warm';
    return {
        temperature: unit === 'fahrenheit' ? Math.round(celsius * 1.8 + 32) : celsius,
        unit,
        summary,
    };
};

/**
 * A stand-in for a real signups query, so the demo has something a client can
 * draw rather than print.
 */
export const signupsOverDays = (days: number): Array<{ date: string; signups: number }> => {
    const today = Date.UTC(2026, 8, 11);
    return Array.from({ length: days }, (_unused, index) => {
        const day = new Date(today - (days - 1 - index) * 86_400_000);
        return {
            date: day.toISOString().slice(0, 10),
            signups: ((index * 7 + 13) % 19) + 1,
        };
    });
};

/**
 * A stand-in for a model, so the demo runs without an API key.
 */
export const noteCallFor = (prompt: string): { id: string; name: string; input?: unknown } => {
    const remembered = /^remember (.+)$/i.exec(prompt.trim());
    if (remembered) {
        return {
            id: `call_${randomUUID()}`,
            name: 'notes_add',
            input: {
                body: {
                    text: remembered[1],
                },
            },
        };
    }
    return {
        id: `call_${randomUUID()}`,
        name: 'notes_list',
    };
};

/**
 * What the stand-in model says once the call answered.
 */
export const replyFor = (result: { state: string; body?: unknown }): string => {
    if (result.state === 'declined') return 'Nothing was saved.';
    const detail = (result.body as { detail?: unknown } | undefined)?.detail;
    if (result.state === 'failed') return `That did not work: ${typeof detail === 'string' ? detail : 'the route refused'}.`;
    return `The route answered ${JSON.stringify(result.body)}.`;
};
