import { describe, expect, it } from 'vitest';
import type { DescribedField } from '../view/schema.js';
import { blockerOf, documentDatesOf, duplicateValuesOf, menuEntriesOf } from './document-menu.js';

const field = (path: string, overrides: Partial<DescribedField> = {}): DescribedField => ({
    path,
    name: path.split('.').at(-1)!,
    readOnly: false,
    required: false,
    writable: true,
    schema: {},
    ...overrides,
});

describe('menuEntriesOf', () => {
    it('offers an item everything, with Delete after the collection actions', () => {
        const entries = menuEntriesOf({
            kind: 'item',
            status: 'changed',
            askable: true,
            actions: [
                {
                    name: 'sendWelcome',
                    label: 'Send welcome email',
                    available: true,
                },
                {
                    name: 'archive',
                    label: 'Archive',
                    available: false,
                },
            ],
        });
        expect(entries.map((entry) => entry.label)).toEqual(['Ask for review', 'Unpublish', 'Duplicate', 'Send welcome email', 'Delete']);
    });

    it('leaves out Unpublish before anything is live, and Duplicate and Delete outside a collection', () => {
        const entries = menuEntriesOf({
            kind: 'page',
            status: 'draft',
            askable: false,
            actions: undefined,
        });
        expect(entries).toEqual([]);
    });
});

describe('duplicateValuesOf', () => {
    it('copies the top-level fields the person may write', () => {
        const fields = [
            field('name'),
            field('slug', {
                readOnly: true,
            }),
            field('salary', {
                writable: false,
            }),
            field('hero'),
            field('hero.heading', {
                parent: 'hero',
            }),
            field('bio'),
        ];
        expect(
            duplicateValuesOf(fields, {
                name: 'Felix Lund',
                slug: 'felix-lund',
                salary: 1,
                hero: {
                    heading: 'Hello',
                },
            })
        ).toEqual({
            name: 'Felix Lund',
            hero: {
                heading: 'Hello',
            },
        });
    });
});

describe('blockerOf', () => {
    it('names the missing fields by their labels', () => {
        const fields = [
            field('department'),
            field('order', {
                label: 'Sort order',
            }),
            field('photo'),
        ];
        expect(blockerOf([], fields)).toBeUndefined();
        expect(blockerOf(['department'], fields)).toBe('Fill in Department before publishing');
        expect(blockerOf(['department', 'order', 'photo'], fields)).toBe('Fill in Department, Sort order and Photo before publishing');
    });
});

describe('documentDatesOf', () => {
    it('reads the first save and the latest publish from the versions, newest first', () => {
        const version = (number: number, published: boolean) => ({
            version: number,
            summary: null,
            createdAt: `2026-10-0${number}T10:00:00.000Z`,
            createdBy: 'ada',
            published,
        });
        expect(documentDatesOf([version(4, false), version(3, true), version(2, true), version(1, false)])).toEqual({
            created: '2026-10-01T10:00:00.000Z',
            published: '2026-10-03T10:00:00.000Z',
        });
        expect(documentDatesOf([])).toEqual({
            created: null,
            published: null,
        });
    });
});
