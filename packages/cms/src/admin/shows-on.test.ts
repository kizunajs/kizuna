import { describe, expect, it } from 'vitest';
import { toggledSites } from './shows-on.js';

describe('Shows on', () => {
    it('turns a site on after the ones held, and off again', () => {
        expect(toggledSites(['norway'], 'uk')).toEqual(['norway', 'uk']);
        expect(toggledSites(['norway', 'uk'], 'uk')).toEqual(['norway']);
        expect(toggledSites(undefined, 'uk')).toEqual(['uk']);
    });
});
