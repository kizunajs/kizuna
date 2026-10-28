import { describe, expect, it } from 'vitest';
import { changesForWire } from './form.js';

describe('changesForWire', () => {
    it('sends an emptied field as null, so the server clears it', () => {
        const wire = JSON.parse(
            JSON.stringify(
                changesForWire({
                    'hero.caption': undefined,
                    title: 'Inside the lamp workshop',
                })
            )
        );
        expect(wire).toEqual({
            'hero.caption': null,
            title: 'Inside the lamp workshop',
        });
    });

    it('keeps every other value as it is', () => {
        expect(
            changesForWire({
                featured: false,
                count: 0,
                summary: '',
            })
        ).toEqual({
            featured: false,
            count: 0,
            summary: '',
        });
    });
});
