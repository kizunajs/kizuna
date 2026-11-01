import { describe, expect, it } from 'vitest';
import type { PageMap, PageMapNode } from '../page-map.js';
import { cardsMatching, connectedTo, mapLayoutOf } from './map-layout.js';

const page = (site: string, name: string, path: string, title: string): PageMapNode => ({
    id: `page:${site}:${name}`,
    ref: `page:${site}:${name}`,
    kind: 'page',
    site,
    title,
    path,
    status: 'published',
});

const MAP: PageMap = {
    nodes: [
        page('uk', 'frontPage', '/', 'Front page'),
        page('uk', 'plantCarePage', '/plant-care', 'Plant care'),
        page('uk', 'plantDoctorPage', '/plant-care/plant-doctor', 'Plant doctor'),
        page('uk', 'historyPage', '/about/history', 'History'),
        {
            id: 'route:uk:shopPage',
            ref: null,
            kind: 'collection',
            site: 'uk',
            title: 'Shop',
            path: '/shops/[slug]',
            status: 'published',
            count: 2,
        },
        {
            id: 'uk|item:offices:oslo',
            ref: 'item:offices:oslo',
            kind: 'item',
            site: 'uk',
            title: 'Oslo',
            path: '/shops/oslo',
            status: 'published',
            collection: 'route:uk:shopPage',
        },
        {
            id: 'uk|item:offices:bergen',
            ref: 'item:offices:bergen',
            kind: 'item',
            site: 'uk',
            title: 'Bergen',
            path: '/shops/bergen',
            status: 'draft',
            collection: 'route:uk:shopPage',
        },
        page('norway', 'frontPage', '/', 'Forside'),
        {
            id: 'global:footer',
            ref: 'global:footer',
            kind: 'document',
            site: null,
            title: 'Footer',
            path: null,
            status: 'published',
        },
    ],
    links: [
        {
            from: 'page:norway:frontPage',
            to: 'page:uk:plantCarePage',
            fieldPaths: ['body.0.markDefs.0'],
            published: true,
            broken: false,
        },
        {
            from: 'page:uk:plantCarePage',
            to: 'item:offices:bergen',
            fieldPaths: ['related'],
            published: true,
            broken: true,
        },
        {
            from: 'page:uk:plantCarePage',
            to: 'item:offices:oslo',
            fieldPaths: ['body.1.markDefs.0'],
            published: false,
            broken: false,
        },
        {
            from: 'global:footer',
            to: 'page:uk:frontPage',
            fieldPaths: ['menu.0'],
            published: true,
            broken: false,
        },
    ],
};

const COLUMNS = ['uk', 'norway', null];

describe('the map layout', () => {
    it('reads each site as a tree under its front page, with a grey card for a part of a path no page sits at', () => {
        const layout = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        const uk = layout.cards.filter((card) => card.node.site === 'uk');
        expect(uk.map((card) => [card.node.title, card.depth, card.parent])).toEqual([
            ['Front page', 0, null],
            ['/about', 1, 'page:uk:frontPage'],
            ['History', 2, 'segment:uk:/about'],
            ['Plant care', 1, 'page:uk:frontPage'],
            ['Plant doctor', 2, 'page:uk:plantCarePage'],
            ['/shops', 1, 'page:uk:frontPage'],
            ['Shop', 2, 'segment:uk:/shops'],
        ]);
        expect(uk.map((card) => card.y)).toEqual([...uk.map((card) => card.y)].sort((left, right) => left - right));
        expect(uk[1]!.x - uk[0]!.x).toBeGreaterThan(0);
        expect(layout.treeLines.map((line) => line.id)).toContain('tree:page:uk:frontPage>page:uk:plantCarePage');
    });

    it('lays the sites out as columns side by side in the order given, the shared content last', () => {
        const layout = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        expect(layout.columns.map((column) => column.site)).toEqual(['uk', 'norway', null]);
        const [uk, norway, shared] = layout.columns;
        expect(norway!.x).toBeGreaterThan(uk!.x + uk!.width);
        expect(shared!.x).toBeGreaterThan(norway!.x + norway!.width);
        expect(layout.cards.find((card) => card.id === 'global:footer')?.x).toBe(shared!.x);
    });

    it('folds a collection into one card with its count, and lists its items under it when expanded', () => {
        const folded = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        expect(folded.cards.some((card) => card.node.kind === 'item')).toBe(false);
        expect(folded.cards.find((card) => card.id === 'route:uk:shopPage')).toMatchObject({
            expanded: false,
            node: {
                count: 2,
            },
        });
        const open = mapLayoutOf(MAP, {
            columns: COLUMNS,
            expanded: new Set(['route:uk:shopPage']),
        });
        expect(open.cards.filter((card) => card.parent === 'route:uk:shopPage').map((card) => card.node.title)).toEqual(['Bergen', 'Oslo']);
    });

    it('meets a folded collection with the links into its items, as one line, broken only when every link is', () => {
        const folded = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        expect(folded.links.filter((link) => link.to === 'route:uk:shopPage')).toEqual([
            {
                id: 'link:page:uk:plantCarePage>route:uk:shopPage',
                from: 'page:uk:plantCarePage',
                to: 'route:uk:shopPage',
                sourceHandle: 'right',
                targetHandle: 'right',
                broken: false,
                published: true,
                crossSite: false,
            },
        ]);
        const open = mapLayoutOf(MAP, {
            columns: COLUMNS,
            expanded: new Set(['route:uk:shopPage']),
        });
        expect(open.links.find((link) => link.to === 'uk|item:offices:bergen')?.broken).toBe(true);
    });

    it('runs a link between columns from the side facing the other', () => {
        const layout = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        expect(layout.links.find((link) => link.from === 'page:norway:frontPage')).toMatchObject({
            to: 'page:uk:plantCarePage',
            sourceHandle: 'left',
            targetHandle: 'right',
            crossSite: true,
        });
        expect(layout.links.find((link) => link.from === 'global:footer')).toMatchObject({
            sourceHandle: 'left',
            targetHandle: 'right',
        });
    });

    it('leaves out a column the filter hides, and the links into it', () => {
        const layout = mapLayoutOf(MAP, {
            columns: ['norway'],
        });
        expect(layout.cards.map((card) => card.id)).toEqual(['page:norway:frontPage']);
        expect(layout.links).toEqual([]);
    });

    it('keeps in view a hovered card, the cards it links to and those linking to it', () => {
        const layout = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        const lit = connectedTo(layout, 'page:uk:plantCarePage');
        expect([...lit.cards].sort()).toEqual(['page:norway:frontPage', 'page:uk:plantCarePage', 'route:uk:shopPage']);
        expect(lit.links.size).toBe(2);
    });

    it('finds pages by title or path, never the grey parts of a path', () => {
        const layout = mapLayoutOf(MAP, {
            columns: COLUMNS,
        });
        expect(cardsMatching(layout, 'plant').map((card) => card.node.title)).toEqual(['Plant care', 'Plant doctor']);
        expect(cardsMatching(layout, '/about').map((card) => card.node.title)).toEqual(['History']);
        expect(cardsMatching(layout, '  ')).toEqual([]);
    });
});
