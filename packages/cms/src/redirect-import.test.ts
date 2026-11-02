import { describe, expect, it } from 'vitest';
import { collapseRows, importedFrom, importedTo, parseCsv, readRedirectCsv } from './redirect-import.js';

describe('parseCsv', () => {
    it('reads quoted fields with commas, quotes and line breaks', () => {
        expect(parseCsv('from,to\r\n"/a,b","/say ""hi"""\r\n"/multi\nline",/c\n')).toEqual([
            {
                line: 1,
                fields: ['from', 'to'],
            },
            {
                line: 2,
                fields: ['/a,b', '/say "hi"'],
            },
            {
                line: 3,
                fields: ['/multi\nline', '/c'],
            },
        ]);
    });

    it('drops a byte order mark and skips blank lines', () => {
        expect(parseCsv('﻿from,to\n\n/a,/b')).toEqual([
            {
                line: 1,
                fields: ['from', 'to'],
            },
            {
                line: 3,
                fields: ['/a', '/b'],
            },
        ]);
    });

    it('refuses a quote that never closes', () => {
        expect(() => parseCsv('from,to\n"/a,/b')).toThrow('line 2');
    });
});

describe('importedFrom', () => {
    it('strips a trailing slash and a fragment, and keeps the query', () => {
        expect(importedFrom('/butikker/oslo/')).toBe('/butikker/oslo');
        expect(importedFrom('/produkt.php?id=12#top')).toBe('/produkt.php?id=12');
        expect(importedFrom('/')).toBe('/');
    });

    it('takes the path and query of a full URL', () => {
        expect(importedFrom('https://old.example.no/produkt.php?id=12')).toBe('/produkt.php?id=12');
    });

    it('refuses what is not a path', () => {
        expect(importedFrom('produkt.php')).toBeUndefined();
        expect(importedFrom('//old.example.no/a')).toBeUndefined();
    });
});

describe('importedTo', () => {
    it('keeps a URL elsewhere as written, and strips a path of its trailing slash', () => {
        expect(importedTo('https://example.com/Shop/')).toBe('https://example.com/Shop/');
        expect(importedTo('/produkter/eik/#pris')).toBe('/produkter/eik#pris');
        expect(importedTo('mailto:post@example.no')).toBeUndefined();
    });
});

describe('readRedirectCsv', () => {
    it('reads columns in any order, with 308 when status is empty', () => {
        expect(readRedirectCsv('to,from,status\n/new,/old,\n/sommer-salg,/sommer,307\n/b,/a,301\n').rows).toEqual([
            {
                line: 2,
                from: '/old',
                to: '/new',
                status: 308,
            },
            {
                line: 3,
                from: '/sommer',
                to: '/sommer-salg',
                status: 307,
            },
            {
                line: 4,
                from: '/a',
                to: '/b',
                status: 308,
            },
        ]);
    });

    it('skips rows it cannot read, duplicates and a row to itself', () => {
        const { rows, skipped } = readRedirectCsv('from,to,status\nold,/new,\n/a,/b,404\n/c,/d,\n/c/,/e,\n/f/,/f,\n');
        expect(rows.map((row) => row.from)).toEqual(['/c']);
        expect(skipped.map((row) => [row.line, row.reason])).toEqual([
            [2, 'invalid'],
            [3, 'invalid'],
            [5, 'duplicate'],
            [6, 'loop'],
        ]);
    });

    it('needs the from and to columns', () => {
        expect(() => readRedirectCsv('source,target\n/a,/b\n')).toThrow('from,to,status');
        expect(() => readRedirectCsv('')).toThrow('empty');
    });
});

describe('collapseRows', () => {
    it('points a row at where the row it names goes', () => {
        const { rows } = readRedirectCsv('from,to\n/a,/b\n/b,/c\n/c,/d\n/x,https://example.com/x\n');
        const result = collapseRows(rows);
        expect(result.rows.map((row) => [row.from, row.to])).toEqual([
            ['/a', '/d'],
            ['/b', '/d'],
            ['/c', '/d'],
            ['/x', 'https://example.com/x'],
        ]);
        expect(result.collapsed.map((row) => [row.from, row.to, row.target])).toEqual([
            ['/a', '/b', '/d'],
            ['/b', '/c', '/d'],
        ]);
    });

    it('skips rows that lead around in a circle', () => {
        const { rows } = readRedirectCsv('from,to\n/a,/b\n/b,/a\n/c,/a\n/d,/e\n');
        const result = collapseRows(rows);
        expect(result.rows.map((row) => row.from)).toEqual(['/d']);
        expect(result.skipped.map((row) => [row.from, row.reason])).toEqual([
            ['/a', 'loop'],
            ['/b', 'loop'],
            ['/c', 'loop'],
        ]);
    });
});
