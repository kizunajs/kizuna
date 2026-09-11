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
