import { describe, expect, test } from 'vitest';
import { computeEtag, etagMatches } from './etag.js';

describe('computeEtag', () => {
    test('is a quoted strong tag', async () => {
        expect(await computeEtag('{"ok":true}')).toMatch(/^"[0-9a-f]{32}"$/);
    });

    test('the same bytes hash to the same tag', async () => {
        expect(await computeEtag('{"ok":true}')).toBe(await computeEtag('{"ok":true}'));
    });

    test('different bytes hash to different tags', async () => {
        expect(await computeEtag('{"ok":true}')).not.toBe(await computeEtag('{"ok":false}'));
    });

    test('a string and its utf-8 bytes hash alike', async () => {
        expect(await computeEtag('héllo')).toBe(await computeEtag(new TextEncoder().encode('héllo')));
    });
});

describe('etagMatches', () => {
    const etag = '"abc123"';

    test('a missing header matches nothing', () => {
        expect(etagMatches(undefined, etag)).toBe(false);
    });

    test('the same tag matches', () => {
        expect(etagMatches('"abc123"', etag)).toBe(true);
    });

    test('a different tag does not', () => {
        expect(etagMatches('"def456"', etag)).toBe(false);
    });

    test('a star matches any representation', () => {
        expect(etagMatches('*', etag)).toBe(true);
    });

    test('one entry of a list is enough', () => {
        expect(etagMatches('"def456", "abc123"', etag)).toBe(true);
    });

    test('the comparison is weak, so a W/ prefix still matches', () => {
        expect(etagMatches('W/"abc123"', etag)).toBe(true);
    });

    test('a tag that only shares a prefix does not match', () => {
        expect(etagMatches('"abc"', etag)).toBe(false);
    });
});
