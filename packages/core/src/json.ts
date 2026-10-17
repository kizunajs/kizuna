/**
 * `JSON.stringify` that writes a bigint as a string of its digits. JSON numbers past 2^53 lose precision,
 * so RFC 7493 §2.2 sends them as strings.
 */
export const stringifyJson = (value: unknown, space?: number): string =>
    JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item), space);
