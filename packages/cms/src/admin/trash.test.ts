import { describe, expect, it } from 'vitest';
import { deleteQuestionOf, emptyQuestionOf, eraseCallOf, eraseQuestionOf, restoreCallOf, trashedOf } from './trash.js';

describe('the trash', () => {
    it('says a delete goes to the trash for 30 days', () => {
        expect(deleteQuestionOf('Spring sale')).toBe(
            'Delete Spring sale? It goes to the trash for 30 days, and pages that show it stop showing it.'
        );
    });

    it('names what goes with an item deleted forever, and asks before emptying', () => {
        expect(
            eraseQuestionOf({
                label: 'Spring sale',
                under: 0,
            })
        ).toBe('Delete Spring sale forever? Its history goes too.');
        expect(
            eraseQuestionOf({
                label: 'Lighting',
                under: 2,
            })
        ).toBe('Delete Lighting and the 2 items under it forever? Their history goes too.');
        expect(emptyQuestionOf(1)).toBe('Empty the trash? The item in it is deleted forever.');
        expect(emptyQuestionOf(3)).toBe('Empty the trash? The 3 items in it are deleted forever.');
    });

    it('restores and deletes forever on the site an item belongs to', () => {
        expect(restoreCallOf('item:articles:k3j9x2')).toEqual({
            name: 'editing_collections_restore_item',
            input: {
                params: {
                    name: 'articles',
                    id: 'k3j9x2',
                },
            },
        });
        expect(eraseCallOf('item:uk:events:k3j9x2')).toEqual({
            name: 'editing_sites_collections_erase_item',
            input: {
                params: {
                    site: 'uk',
                    name: 'events',
                    id: 'k3j9x2',
                },
            },
        });
        expect(restoreCallOf('page:frontPage')).toBeUndefined();
    });

    it('reads the trash a 404 names', () => {
        expect(
            trashedOf({
                detail: 'In the trash.',
                trashed: {
                    at: '2026-10-30T09:00:00.000Z',
                    by: 'Ada',
                },
            })
        ).toEqual({
            at: '2026-10-30T09:00:00.000Z',
            by: 'Ada',
        });
        expect(
            trashedOf({
                detail: 'No such item.',
            })
        ).toBeUndefined();
    });
});
