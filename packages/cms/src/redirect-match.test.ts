import { describe, expect, it } from 'vitest';
import { matchRedirect, type RedirectTable } from './redirect-match.js';

const table: RedirectTable = {
    version: 4,
    redirects: [
        {
            from: '/butikker/oslo',
            to: '/butikker/oslo-sentrum',
            status: 308,
        },
        {
            from: '/sommer',
            to: '/kampanjer/sommer?kilde=plakat',
            status: 307,
        },
        {
            from: '/produkt.php',
            to: '/produkter',
            status: 308,
        },
        {
            from: '/produkt.php?id=12',
            to: 'https://hagen.example.no/produkter/eik',
            status: 308,
        },
    ],
};

const get = (url: string) => ({
    method: 'GET',
    url,
});

describe('matchRedirect', () => {
    it('sends an exact path to its target, as an absolute URL', () => {
        expect(matchRedirect(table, get('https://hagen.example.no/butikker/oslo'))).toEqual({
            location: 'https://hagen.example.no/butikker/oslo-sentrum',
            status: 308,
        });
    });

    it('compares paths exactly and by case', () => {
        expect(matchRedirect(table, get('https://hagen.example.no/butikker/oslo/'))).toBeUndefined();
        expect(matchRedirect(table, get('https://hagen.example.no/Butikker/oslo'))).toBeUndefined();
        expect(matchRedirect(table, get('https://hagen.example.no/butikker'))).toBeUndefined();
    });

    it('carries the query to the target, keeping a parameter the target sets', () => {
        expect(matchRedirect(table, get('https://hagen.example.no/butikker/oslo?utm_source=nyhetsbrev'))?.location).toBe(
            'https://hagen.example.no/butikker/oslo-sentrum?utm_source=nyhetsbrev'
        );
        expect(matchRedirect(table, get('https://hagen.example.no/sommer?kilde=avis&side=2'))).toEqual({
            location: 'https://hagen.example.no/kampanjer/sommer?kilde=plakat&side=2',
            status: 307,
        });
    });

    it('tries a from with a query first, for requests carrying its parameters', () => {
        expect(matchRedirect(table, get('https://hagen.example.no/produkt.php?id=12&utm_source=avis'))?.location).toBe(
            'https://hagen.example.no/produkter/eik?utm_source=avis'
        );
        expect(matchRedirect(table, get('https://hagen.example.no/produkt.php?id=13'))?.location).toBe(
            'https://hagen.example.no/produkter?id=13'
        );
    });

    it('redirects GET and HEAD only', () => {
        expect(
            matchRedirect(table, {
                method: 'HEAD',
                url: 'https://hagen.example.no/butikker/oslo',
            })?.status
        ).toBe(308);
        expect(
            matchRedirect(table, {
                method: 'POST',
                url: 'https://hagen.example.no/butikker/oslo',
            })
        ).toBeUndefined();
    });
});
