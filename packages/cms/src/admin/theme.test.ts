import { describe, expect, it } from 'vitest';
import { choiceOf, themeOf } from './theme.js';

describe('the admin theme', () => {
    it('follows the system until the editor picks one', () => {
        expect(themeOf('system', true)).toBe('light');
        expect(themeOf('system', false)).toBe('dark');
        expect(themeOf('light', false)).toBe('light');
        expect(themeOf('dark', true)).toBe('dark');
    });

    it('reads a stored choice back, and the system for anything else', () => {
        expect(choiceOf('light')).toBe('light');
        expect(choiceOf('dark')).toBe('dark');
        expect(choiceOf(null)).toBe('system');
        expect(choiceOf('sepia')).toBe('system');
    });
});
