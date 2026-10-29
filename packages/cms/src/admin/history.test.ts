import { describe, expect, it } from 'vitest';
import { savedAtOf } from './history.js';

describe('when a version was saved', () => {
    it('leaves out the year this year, and writes it for an earlier one', () => {
        const today = new Date('2026-10-28T12:00:00Z');
        expect(savedAtOf('2026-10-24T09:12:00Z', today)).not.toMatch(/2026/);
        expect(savedAtOf('2025-10-24T09:12:00Z', today)).toMatch(/2025/);
        expect(savedAtOf('not a date', today)).toBe('');
    });
});
