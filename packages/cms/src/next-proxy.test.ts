import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { contentProxy } from './next-proxy.js';
import type { RedirectTable } from './redirect-match.js';

const table = (version: number, to: string): RedirectTable => ({
    version,
    redirects: [
        {
            from: '/butikker/oslo',
            to,
            status: 308,
        },
    ],
});

/**
 * A CMS that answers each check with the next of `answers`: a table, `304`,
 * or a failure.
 */
const cmsAnswering = (answers: Array<RedirectTable | 304 | 'down'>) => {
    const asked: Array<{ url: string; ifNoneMatch: string | null }> = [];
    vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string, init: RequestInit) => {
            asked.push({
                url,
                ifNoneMatch: new Headers(init.headers).get('if-none-match'),
            });
            const answer = answers.shift();
            if (answer === 'down' || answer === undefined) throw new TypeError('fetch failed');
            if (answer === 304) {
                return new Response(null, {
                    status: 304,
                });
            }
            return Response.json(answer, {
                headers: {
                    etag: `"${answer.version}"`,
                },
            });
        })
    );
    return asked;
};

const visit = (path: string, method = 'GET') =>
    new NextRequest(`https://hagen.example.no${path}`, {
        method,
    });

const after: Array<Promise<unknown>> = [];
const event = {
    waitUntil: (promise: Promise<unknown>) => {
        after.push(promise);
    },
};

beforeEach(() => {
    vi.useFakeTimers({
        toFake: ['Date'],
    });
    after.length = 0;
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('contentProxy', () => {
    it("answers a redirect from the site's table with its status and an hour's caching", async () => {
        const asked = cmsAnswering([table(1, '/butikker/oslo-sentrum')]);
        const redirects = contentProxy({
            cms: 'https://cms.example.com/api/',
            site: 'norway',
        });
        const response = await redirects(visit('/butikker/oslo?utm_source=avis'), event);
        expect(response?.status).toBe(308);
        expect(response?.headers.get('location')).toBe('https://hagen.example.no/butikker/oslo-sentrum?utm_source=avis');
        expect(response?.headers.get('cache-control')).toBe('max-age=3600');
        expect(await redirects(visit('/butikker/bergen'), event)).toBeUndefined();
        expect(asked).toEqual([
            {
                url: 'https://cms.example.com/api/content/sites/norway/redirects',
                ifNoneMatch: null,
            },
        ]);
    });

    it('leaves requests other than GET and HEAD alone', async () => {
        cmsAnswering([table(1, '/butikker/oslo-sentrum')]);
        const redirects = contentProxy({
            cms: 'https://cms.example.com/api',
            site: 'norway',
        });
        expect(await redirects(visit('/butikker/oslo', 'POST'), event)).toBeUndefined();
        expect((await redirects(visit('/butikker/oslo', 'HEAD'), event))?.status).toBe(308);
    });

    it('checks again after ten seconds, after the response, sending the version it holds', async () => {
        const asked = cmsAnswering([table(1, '/butikker/oslo-sentrum'), 304, table(2, '/butikker/oslo-torget')]);
        const redirects = contentProxy({
            cms: 'https://cms.example.com/api',
            site: 'norway',
        });
        await redirects(visit('/'), event);
        vi.advanceTimersByTime(5_000);
        await redirects(visit('/'), event);
        expect(asked).toHaveLength(1);
        vi.advanceTimersByTime(5_000);
        await redirects(visit('/'), event);
        await Promise.all(after);
        expect(asked.at(-1)?.ifNoneMatch).toBe('"1"');
        vi.advanceTimersByTime(10_000);
        const stale = await redirects(visit('/butikker/oslo'), event);
        expect(stale?.headers.get('location')).toBe('https://hagen.example.no/butikker/oslo-sentrum');
        await Promise.all(after);
        const fresh = await redirects(visit('/butikker/oslo'), event);
        expect(fresh?.headers.get('location')).toBe('https://hagen.example.no/butikker/oslo-torget');
    });

    it('keeps its last table while the CMS is down', async () => {
        cmsAnswering([table(1, '/butikker/oslo-sentrum'), 'down']);
        const redirects = contentProxy({
            cms: 'https://cms.example.com/api',
            site: 'norway',
        });
        await redirects(visit('/'), event);
        vi.advanceTimersByTime(10_000);
        await redirects(visit('/'), event);
        await Promise.all(after);
        expect((await redirects(visit('/butikker/oslo'), event))?.status).toBe(308);
    });

    it('serves pages without redirects while the CMS has never answered', async () => {
        const asked = cmsAnswering(['down']);
        const redirects = contentProxy({
            cms: 'https://cms.example.com/api',
        });
        expect(await redirects(visit('/butikker/oslo'), event)).toBeUndefined();
        expect(await redirects(visit('/butikker/oslo'), event)).toBeUndefined();
        expect(asked.map((check) => check.url)).toEqual(['https://cms.example.com/api/content/redirects']);
    });
});
