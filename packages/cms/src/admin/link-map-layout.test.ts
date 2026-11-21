import { describe, expect, it } from 'vitest';
import {
    domainLetterOf,
    linkCardsMatching,
    linkFiltersOf,
    linkMapLayoutOf,
    linksPillOf,
    shownLinesOf,
    type LinkMapAnswer,
    type LinkNode,
} from './link-map-layout.js';

const page = (site: string | null, name: string, path: string, title: string, linksIn: number, brokenOut = 0): LinkNode => ({
    id: `page:${site ?? ''}:${name}`,
    kind: 'page',
    ref: site === null ? `item:tasks:${name}` : `page:${site}:${name}`,
    site,
    title,
    path,
    linksIn,
    brokenOut,
});

const ANSWER: LinkMapAnswer = {
    nodes: [
        page('uk', 'frontPage', '/', 'Front page', 3),
        page('uk', 'eventsPage', '/events', 'Events', 1),
        page('uk', 'signUpPage', '/events/sign-up', 'Sign up', 0, 1),
        page(null, 'launch', '/tasks/launch', 'Launch', 2),
        {
            id: 'external:in.example.org',
            kind: 'external',
            domain: 'in.example.org',
        },
        {
            id: 'external:out.example.com',
            kind: 'external',
            domain: 'out.example.com',
            path: '/guide',
        },
        {
            id: 'broken:/gone',
            kind: 'broken',
            title: '/gone',
            reason: 'missing',
        },
    ],
    edges: [
        {
            from: 'page:uk:frontPage',
            to: 'page:uk:eventsPage',
            broken: false,
            external: false,
        },
        {
            from: 'external:in.example.org',
            to: 'page:uk:eventsPage',
            broken: false,
            external: true,
            anchor: 'their events',
        },
        {
            from: 'page:uk:eventsPage',
            to: 'external:out.example.com',
            broken: false,
            external: true,
        },
        {
            from: 'page:uk:signUpPage',
            to: 'broken:/gone',
            broken: true,
            external: false,
        },
    ],
};

describe('linkMapLayoutOf', () => {
    const layout = linkMapLayoutOf(ANSWER, 'uk');
    const cardOf = (id: string) => layout.cards.find((card) => card.id === id)!;

    it('puts other sites linking in left, the site and shared in the middle, and links out right', () => {
        expect(cardOf('external:in.example.org').column).toBe('in');
        expect(cardOf('page:uk:frontPage').column).toBe('site');
        expect(cardOf('page::launch').column).toBe('shared');
        expect(cardOf('external:out.example.com').column).toBe('out');
        expect(cardOf('broken:/gone').column).toBe('out');
        expect(cardOf('external:in.example.org').x).toBeLessThan(cardOf('page:uk:frontPage').x);
        expect(cardOf('page:uk:frontPage').x).toBeLessThan(cardOf('external:out.example.com').x);
    });

    it('lays the site out as a tree, with the shared content under it', () => {
        expect(cardOf('page:uk:signUpPage').x).toBeGreaterThan(cardOf('page:uk:eventsPage').x);
        expect(cardOf('page::launch').y).toBeGreaterThan(cardOf('page:uk:signUpPage').y);
        expect(layout.heads.map((head) => head.column)).toEqual(['site', 'shared', 'in', 'out']);
    });

    it('sets a card beside what it links with', () => {
        expect(cardOf('external:in.example.org').y).toBe(cardOf('page:uk:eventsPage').y);
        expect(cardOf('broken:/gone').y).toBe(cardOf('page:uk:signUpPage').y);
    });

    it('reads the link text, the path, or why a target is gone under the title', () => {
        expect(cardOf('external:in.example.org').detail).toBe('“their events”');
        expect(cardOf('external:out.example.com').detail).toBe('/guide');
        expect(cardOf('broken:/gone').detail).toBe('No page here');
        expect(cardOf('page:uk:eventsPage').detail).toBe('/events');
    });

    it('curves links between the pages to the right, and others across', () => {
        const line = (from: string, to: string) => layout.lines.find((candidate) => candidate.id === `link:${from}>${to}`)!;
        expect(line('page:uk:frontPage', 'page:uk:eventsPage')).toMatchObject({
            sourceHandle: 'right',
            targetHandle: 'right',
        });
        expect(line('external:in.example.org', 'page:uk:eventsPage')).toMatchObject({
            sourceHandle: 'right',
            targetHandle: 'left',
            external: true,
        });
    });

    it('treats every page as its own with one site', () => {
        const single = linkMapLayoutOf(ANSWER, undefined);
        expect(single.cards.find((card) => card.id === 'page::launch')?.column).toBe('site');
        expect(single.heads.some((head) => head.column === 'shared')).toBe(false);
    });
});

describe('shownLinesOf', () => {
    const layout = linkMapLayoutOf(ANSWER, 'uk');

    it('draws the broken links alone until a page is chosen', () => {
        expect(shownLinesOf(layout, undefined).map((line) => line.id)).toEqual(['link:page:uk:signUpPage>broken:/gone']);
    });

    it("adds the chosen page's links", () => {
        expect(shownLinesOf(layout, 'page:uk:eventsPage').map((line) => line.id)).toEqual([
            'link:page:uk:frontPage>page:uk:eventsPage',
            'link:external:in.example.org>page:uk:eventsPage',
            'link:page:uk:eventsPage>external:out.example.com',
            'link:page:uk:signUpPage>broken:/gone',
        ]);
    });
});

describe('linksPillOf', () => {
    it('reads broken links first, then red at none and yellow at one', () => {
        expect(
            linksPillOf({
                linksIn: 4,
                brokenOut: 1,
            })
        ).toEqual({
            text: '1 broken',
            band: 'poor',
        });
        expect(
            linksPillOf({
                linksIn: 0,
                brokenOut: 0,
            }).band
        ).toBe('poor');
        expect(
            linksPillOf({
                linksIn: 1,
                brokenOut: 0,
            }).band
        ).toBe('fair');
        expect(
            linksPillOf({
                linksIn: 9,
                brokenOut: 0,
            })
        ).toEqual({
            text: '9 in',
            band: 'none',
        });
    });
});

describe('linkFiltersOf', () => {
    it('counts the pages nothing links to, the broken links and the pages with one link in', () => {
        const filters = linkFiltersOf(ANSWER);
        expect(filters.orphans.count).toBe(1);
        expect([...filters.orphans.cards]).toEqual(['page:uk:signUpPage']);
        expect(filters.broken.count).toBe(1);
        expect([...filters.broken.cards]).toEqual(['page:uk:signUpPage', 'broken:/gone']);
        expect(filters['one-in'].count).toBe(1);
    });
});

describe('linkCardsMatching', () => {
    it('finds pages by title or path', () => {
        const layout = linkMapLayoutOf(ANSWER, 'uk');
        expect(linkCardsMatching(layout, 'sign').map((card) => card.id)).toEqual(['page:uk:signUpPage']);
        expect(linkCardsMatching(layout, '/tasks').map((card) => card.id)).toEqual(['page::launch']);
        expect(linkCardsMatching(layout, ' ')).toEqual([]);
    });
});

describe('domainLetterOf', () => {
    it('takes the first letter after www', () => {
        expect(domainLetterOf('www.example.org')).toBe('E');
    });
});
