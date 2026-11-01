import { describe, expect, it } from 'vitest';
import { branchQuestionOf, itemsUnder } from './branch.js';

const menu = [
    {
        id: 'omOss',
        label: 'Om oss',
        parent: null,
    },
    {
        id: 'jobb',
        label: 'Jobb hos oss',
        parent: 'omOss',
    },
    {
        id: 'kontakt',
        label: 'Kontakt',
        parent: 'omOss',
    },
    {
        id: 'presse',
        label: 'Presse',
        parent: 'kontakt',
    },
    {
        id: 'personvern',
        label: 'Personvern',
        parent: null,
    },
];

describe('deleting a parent', () => {
    it('finds every item under one, at any depth', () => {
        expect(itemsUnder(menu, 'omOss').map((item) => item.label)).toEqual(['Jobb hos oss', 'Kontakt', 'Presse']);
        expect(itemsUnder(menu, 'personvern')).toEqual([]);
    });

    it('names what goes with it, or asks as any delete does', () => {
        expect(branchQuestionOf(['Om oss'], ['Jobb hos oss', 'Kontakt'])).toBe(
            'Delete Om oss and the 2 items under it? Jobb hos oss and Kontakt go with it. They go to the trash for 30 days, and pages that show them stop showing them.'
        );
        expect(branchQuestionOf(['Om oss', 'Butikker'], ['Oslo', 'Bergen', 'Jobb hos oss', 'Kontakt'])).toBe(
            'Delete 2 items and the 4 items under them? They go to the trash for 30 days, and pages that show them stop showing them.'
        );
        expect(branchQuestionOf(['Personvern'], [])).toBeUndefined();
    });
});
