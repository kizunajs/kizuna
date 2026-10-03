/**
 * A URL's query as a route reads it: a key given once is a string, a key
 * given more than once is a list, so `?ids=a&ids=b` reaches the route as
 * `['a', 'b']`.
 */
export const queryFromSearchParams = (params: URLSearchParams): Record<string, string | string[]> => {
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of params) {
        const held = query[key];
        query[key] = held === undefined ? value : Array.isArray(held) ? [...held, value] : [held, value];
    }
    return query;
};
