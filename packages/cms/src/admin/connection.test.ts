import { describe, expect, it } from 'vitest';
import { connectOverHttp } from './connection.js';

interface Sent {
    url: string;
    init: RequestInit;
}

const recording = (answer: () => Response) => {
    const sent: Sent[] = [];
    const connection = connectOverHttp({
        apiPath: '/cms-api/',
        routes: {
            editing_describe: {
                method: 'GET',
                path: '/editing/describe',
            },
            editing_search_items: {
                method: 'GET',
                path: '/editing/search/:brand',
            },
            editing_collections_update_draft: {
                method: 'PATCH',
                path: '/editing/collections/:name/items/:id/draft',
            },
            editing_collections_delete_item: {
                method: 'DELETE',
                path: '/editing/collections/:name/items/:id',
            },
        },
        fetch: async (input, init) => {
            sent.push({
                url: String(input),
                init: init ?? {},
            });
            return answer();
        },
    });
    return {
        sent,
        connection,
    };
};

describe('the admin connection', () => {
    it('calls a tool as its route, with the query in the address', async () => {
        const { sent, connection } = recording(() =>
            Response.json({
                ref: 'page:frontPage',
            })
        );
        const answer = await connection.call('editing_describe', {
            query: {
                ref: 'page:frontPage',
            },
        });
        expect(sent[0]!.url).toBe('/cms-api/editing/describe?ref=page%3AfrontPage');
        expect(sent[0]!.init.method).toBe('GET');
        expect(sent[0]!.init.credentials).toBe('same-origin');
        expect(sent[0]!.init.cache).toBe('no-store');
        expect(sent[0]!.init.body).toBeUndefined();
        expect(answer).toEqual({
            status: 200,
            body: {
                ref: 'page:frontPage',
            },
        });
    });

    it('fills in the path params and sends the body as JSON', async () => {
        const { sent, connection } = recording(() =>
            Response.json({
                version: 2,
            })
        );
        await connection.call('editing_collections_update_draft', {
            params: {
                name: 'articles',
                id: 'a/1',
            },
            body: {
                changes: {
                    title: 'Inside the lamp workshop',
                },
            },
        });
        expect(sent[0]!.url).toBe('/cms-api/editing/collections/articles/items/a%2F1/draft');
        expect(sent[0]!.init.method).toBe('PATCH');
        expect((sent[0]!.init.headers as Record<string, string>)['content-type']).toBe('application/json');
        expect(JSON.parse(sent[0]!.init.body as string)).toEqual({
            changes: {
                title: 'Inside the lamp workshop',
            },
        });
    });

    it('repeats a query key for each item of a list', async () => {
        const { sent, connection } = recording(() =>
            Response.json({
                items: [],
            })
        );
        await connection.call('editing_search_items', {
            params: {
                brand: 'EmployeeId',
            },
            query: {
                ids: ['ada', 'grace'],
                q: undefined,
            },
        });
        expect(sent[0]!.url).toBe('/cms-api/editing/search/EmployeeId?ids=ada&ids=grace');
    });

    it('answers a route with no body, and a problem, as the tools do', async () => {
        const empty = recording(
            () =>
                new Response(null, {
                    status: 204,
                })
        );
        expect(
            await empty.connection.call('editing_collections_delete_item', {
                params: {
                    name: 'articles',
                    id: '1',
                },
            })
        ).toEqual({
            status: 204,
            body: undefined,
        });
        const refused = recording(() =>
            Response.json(
                {
                    detail: 'Sign in as an editor.',
                },
                {
                    status: 401,
                }
            )
        );
        expect(await refused.connection.call('editing_describe')).toEqual({
            status: 401,
            body: {
                detail: 'Sign in as an editor.',
            },
        });
    });

    it('answers a tool with no route, and a request that never arrived, without throwing', async () => {
        const { sent, connection } = recording(() => {
            throw new Error('offline');
        });
        expect((await connection.call('editing_unknown')).status).toBe(404);
        expect(sent).toHaveLength(0);
        expect(await connection.call('editing_describe')).toEqual({
            status: 503,
            body: {
                detail: 'offline',
            },
        });
    });
});
