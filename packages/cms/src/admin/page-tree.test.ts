import { describe, expect, it } from 'vitest';
import { descendantsIn, pageTreeOf, parentPathOf } from './page-tree.js';
import type { TreeRow } from './list-rows.js';

const page = (title: string, path: string): TreeRow => ({
    ref: `page:uk:${title}`,
    href: `/admin/uk/pages/${title}`,
    title,
    detail: path,
    status: 'published',
});

describe('the pages tree', () => {
    it('reads the path a page sits under, with the front page at the top', () => {
        expect(parentPathOf('/')).toBeNull();
        expect(parentPathOf('/events')).toBeNull();
        expect(parentPathOf('/plant-care/winter')).toBe('/plant-care');
    });

    it('nests pages by path, front page first, with a grey row for a path that has no page and a row for each collection route', () => {
        const rows = pageTreeOf(
            [page('Our history', '/about/history'), page('Events', '/events'), page('Front page', '/'), page('Careers', '/about/careers')],
            [
                {
                    name: 'eventPage',
                    title: 'Event',
                    path: '/events/[slug]',
                    href: '/admin/uk/collections/events',
                    count: '3 events',
                },
            ],
            'uk'
        );
        expect(
            rows.map(
                (row) =>
                    `${row.tree!.parent ?? '-'} ${row.title}${row.segment === true ? ' (no page)' : ''}${row.count === undefined ? '' : ` ${row.count}`}`
            )
        ).toEqual(['- Front page', '- /about (no page)', '/about Careers', '/about Our history', '- Events', '/events Event 3 events']);
        expect(rows.filter((row) => row.selectable === false).map((row) => row.title)).toEqual(['/about', 'Event']);
    });

    it('finds every row under the ones named', () => {
        const rows = pageTreeOf(
            [page('Front page', '/'), page('Winter care', '/plant-care/winter'), page('Plant care', '/plant-care')],
            []
        );
        expect([...descendantsIn(rows, ['page:uk:Plant care'])]).toEqual(['page:uk:Winter care']);
    });
});
