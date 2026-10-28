import { describe, expect, it } from 'vitest';
import type { ToolAnswer } from '../view/connection.js';
import { bulkCallOf, bulkQuestionOf, bulkSummaryOf, offeredActions, runBulk } from './bulk.js';

describe('the bulk bar', () => {
    it('offers the actions the CMS has a route for', () => {
        expect(
            offeredActions({
                editing_collections_publish: {},
                editing_collections_delete_item: {},
            })
        ).toEqual(['publish', 'delete']);
    });

    it('calls the editing route for each item', () => {
        expect(bulkCallOf('publish', 'item:articles:springSale')).toEqual({
            name: 'editing_collections_publish',
            input: {
                params: {
                    name: 'articles',
                    id: 'springSale',
                },
                body: {},
            },
        });
        expect(bulkCallOf('delete', 'item:articles:springSale')).toEqual({
            name: 'editing_collections_delete_item',
            input: {
                params: {
                    name: 'articles',
                    id: 'springSale',
                },
            },
        });
        expect(bulkCallOf('publish', 'global:site')).toBeUndefined();
    });

    it('asks first, counting the items', () => {
        expect(bulkQuestionOf('publish', 1)).toBe('Publish 1 item? Every visitor sees them at once.');
        expect(bulkQuestionOf('delete', 3)).toBe('Delete 3 items, with their history? Pages that show them stop showing them.');
    });

    it('runs on every item, and reports each one the server refused', async () => {
        const called: string[] = [];
        const results = await runBulk(
            'publish',
            [
                {
                    ref: 'item:articles:springSale',
                    title: 'Spring sale',
                },
                {
                    ref: 'item:articles:benchLamps',
                    title: 'Bench lamps',
                },
            ],
            async (_name, input): Promise<ToolAnswer> => {
                const id = (input['params'] as { id: string }).id;
                called.push(id);
                return id === 'benchLamps'
                    ? {
                          status: 409,
                          body: {
                              detail: 'The draft is waiting for a review.',
                          },
                      }
                    : {
                          status: 200,
                          body: {},
                      };
            }
        );
        expect(called).toEqual(['springSale', 'benchLamps']);
        expect(bulkSummaryOf('publish', results)).toEqual({
            problem: true,
            message: 'Published 1 of 2 items.',
            failures: [
                {
                    title: 'Bench lamps',
                    problem: 'The draft is waiting for a review.',
                },
            ],
        });
    });

    it('says how many it did, or that it did none', () => {
        const spring = {
            ref: 'item:articles:springSale',
            title: 'Spring sale',
        };
        expect(
            bulkSummaryOf('delete', [
                {
                    ...spring,
                    problem: undefined,
                },
            ])
        ).toEqual({
            problem: false,
            message: 'Deleted 1 item.',
            failures: [],
        });
        expect(
            bulkSummaryOf('unpublish', [
                {
                    ...spring,
                    problem: 'No item.',
                },
                {
                    ...spring,
                    title: 'Bench lamps',
                    problem: 'No item.',
                },
            ]).message
        ).toBe('Unpublish did not run on any of the 2 items.');
    });
});
