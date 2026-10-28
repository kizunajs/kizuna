import type { Connection, ToolAnswer } from '../view/connection.js';
import type { AdminRoute } from './config.js';

/**
 * A route's path with its params filled in, each one encoded.
 */
const fillPath = (path: string, params: Record<string, unknown>): string =>
    path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) => encodeURIComponent(String(params[name] ?? '')));

/**
 * A query object as a search string, repeating a key for each item of a list.
 */
const searchOf = (query: Record<string, unknown>): string => {
    const search = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) search.append(name, String(item));
    }
    const written = search.toString();
    return written === '' ? '' : `?${written}`;
};

const bodyOf = async (response: Response): Promise<unknown> => {
    const text = await response.text();
    if (text === '') return undefined;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return response.ok
            ? text
            : {
                  detail: text,
              };
    }
};

/**
 * Calls the CMS's editing routes over HTTP, as the person signed in, in place
 * of the tools an MCP host calls. A tool's name finds its route, and its
 * `params`, `query` and `body` become the request's.
 */
export const connectOverHttp = (options: { apiPath: string; routes: Record<string, AdminRoute>; fetch?: typeof fetch }): Connection => {
    const send = options.fetch ?? ((input, init) => fetch(input, init));
    const apiPath = options.apiPath.replace(/\/+$/, '');
    return {
        call: async <Body = unknown>(name: string, input?: Record<string, unknown>): Promise<ToolAnswer<Body>> => {
            const route = options.routes[name];
            if (route === undefined) {
                return {
                    status: 404,
                    body: {
                        detail: `The CMS has no route for ${name}.`,
                    },
                } as ToolAnswer<Body>;
            }
            const params = (input?.['params'] ?? {}) as Record<string, unknown>;
            const query = (input?.['query'] ?? {}) as Record<string, unknown>;
            const body = input?.['body'];
            try {
                const response = await send(`${apiPath}${fillPath(route.path, params)}${searchOf(query)}`, {
                    method: route.method,
                    credentials: 'same-origin',
                    headers:
                        body === undefined
                            ? {
                                  accept: 'application/json',
                              }
                            : {
                                  accept: 'application/json',
                                  'content-type': 'application/json',
                              },
                    ...(body === undefined
                        ? {}
                        : {
                              body: JSON.stringify(body),
                          }),
                });
                return {
                    status: response.status,
                    body: (await bodyOf(response)) as Body,
                };
            } catch (error) {
                // The request never reached the CMS, so answer the way a failed route does.
                return {
                    status: 503,
                    body: {
                        detail: error instanceof Error ? error.message : 'The CMS could not be reached.',
                    },
                } as ToolAnswer<Body>;
            }
        },
    };
};
