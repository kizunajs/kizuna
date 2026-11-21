import { describe, expect, it } from 'vitest';
import { uniqueNames } from './generator-utils.js';

describe('uniqueNames', () => {
    it('puts `_` in front of a name an earlier one took, as often as it takes', () => {
        expect(uniqueNames(['name', 'name', 'name', 'createdAt'])).toEqual(['name', '_name', '__name', 'createdAt']);
    });

    it('returns a list with no clash as it was', () => {
        expect(uniqueNames(['name', 'createdAt'])).toEqual(['name', 'createdAt']);
    });
});
