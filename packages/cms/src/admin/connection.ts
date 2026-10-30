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
                    // The editor always wants what the CMS holds now. A cached answer revalidated by its ETag misses a review asked for since, which changes no draft.
                    cache: 'no-store',
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

/**
 * The media routes a site's screens list and upload through.
 */
const SITE_MEDIA_TOOLS = ['editing_media_list', 'editing_media_create_upload'];

// TODO(sites): the `site` query the CMS's media routes are expected to take.
/**
 * A connection whose media calls name `site`, so a site's library lists its
 * own images beside the shared ones and an upload belongs to it. Without a
 * site, media calls list and upload shared images alone.
 */
export const withMediaSite = (connection: Connection, site: string | undefined): Connection =>
    site === undefined
        ? connection
        : {
              ...connection,
              call: (name, input, options) =>
                  connection.call(
                      name,
                      SITE_MEDIA_TOOLS.includes(name)
                          ? {
                                ...input,
                                query: {
                                    ...((input?.['query'] ?? {}) as Record<string, unknown>),
                                    site,
                                },
                            }
                          : input,
                      options
                  ),
          };

/**
 * A connection whose collection calls reach a site's own collections, like
 * the UK's events, at the routes under the site.
 */
export const withSiteCollections = (connection: Connection, site: string): Connection => ({
    ...connection,
    call: (name, input, options) => {
        if (!name.startsWith('editing_collections_')) return connection.call(name, input, options);
        return connection.call(
            name.replace('editing_collections_', 'editing_sites_collections_'),
            {
                ...input,
                params: {
                    ...((input?.['params'] ?? {}) as Record<string, unknown>),
                    site,
                },
            },
            options
        );
    },
});

/**
 * A connection whose searches for ids pick them for a site, so a collection
 * that chooses its sites offers only the items that site shows.
 */
export const withSearchOn = (connection: Connection, site: string): Connection => {
    const bySite = searchConnections.get(connection) ?? new Map<string, Connection>();
    searchConnections.set(connection, bySite);
    const known = bySite.get(site);
    if (known !== undefined) return known;
    const searching = searchOn(connection, site);
    bySite.set(site, searching);
    return searching;
};

/**
 * Each connection's site-searching copies, kept so a document's connection stays the same object between renders.
 */
const searchConnections = new WeakMap<Connection, Map<string, Connection>>();

const searchOn = (connection: Connection, site: string): Connection => ({
    ...connection,
    call: (name, input, options) =>
        name !== 'editing_search_items'
            ? connection.call(name, input, options)
            : connection.call(
                  name,
                  {
                      ...input,
                      query: {
                          ...((input?.['query'] ?? {}) as Record<string, unknown>),
                          site,
                      },
                  },
                  options
              ),
});
