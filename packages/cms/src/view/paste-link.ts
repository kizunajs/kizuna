/**
 * The URL a paste holds when it is one `https://` or `http://` address and
 * nothing else, or `undefined` for any other text.
 */
export const pastedUrlOf = (text: string): string | undefined => {
    const trimmed = text.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) return undefined;
    try {
        new URL(trimmed);
        return trimmed;
    } catch {
        return undefined;
    }
};
