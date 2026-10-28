import { describe, expect, it } from 'vitest';
import { relativeTimeOf } from './time.js';

const now = new Date('2026-10-28T12:00:00.000Z');
const before = (milliseconds: number): string => new Date(now.getTime() - milliseconds).toISOString();

describe('relativeTimeOf', () => {
    it('says just now for the last few seconds', () => {
        expect(relativeTimeOf(before(10_000), now)).toBe('just now');
    });

    it('counts minutes, then hours', () => {
        expect(relativeTimeOf(before(4 * 60_000), now)).toBe('4 min ago');
        expect(relativeTimeOf(before(60 * 60_000), now)).toBe('1 hour ago');
        expect(relativeTimeOf(before(5 * 60 * 60_000), now)).toBe('5 hours ago');
    });

    it('counts days for a week, then names the day', () => {
        expect(relativeTimeOf(before(30 * 60 * 60_000), now)).toBe('yesterday');
        expect(relativeTimeOf(before(3 * 24 * 60 * 60_000), now)).toBe('3 days ago');
        expect(relativeTimeOf(before(20 * 24 * 60 * 60_000), now)).toMatch(/^on /);
    });

    it('reads a time a moment ahead of the clock as just now', () => {
        expect(relativeTimeOf(new Date(now.getTime() + 5_000).toISOString(), now)).toBe('just now');
    });
});
