import { describe, expect, it } from 'vitest';
import { fromProblem, planRedirect, targetProblem, type PlannedRedirect } from './redirect-edits.js';

const shop: PlannedRedirect = {
    id: 'oslo',
    from: '/butikker/oslo',
    to: {
        type: 'document',
        ref: 'item:articles:k3j9x2',
    },
};

const summer: PlannedRedirect = {
    id: 'summer',
    from: '/sommer',
    to: {
        type: 'path',
        path: '/kampanjer/sommer',
    },
};

describe('fromProblem', () => {
    it('takes a path, with or without a query', () => {
        expect(fromProblem('/butikker/oslo')).toBeUndefined();
        expect(fromProblem('/produkt.php?id=12')).toBeUndefined();
        expect(fromProblem('/')).toBeUndefined();
    });

    it('refuses a path ending in /, since it never reaches a redirect', () => {
        expect(fromProblem('/butikker/oslo/')).toContain('Write it as /butikker/oslo');
        expect(fromProblem('/butikker/?id=1')).toContain('ends in /');
    });

    it('refuses what a request cannot ask for', () => {
        expect(fromProblem('butikker')).toContain('is not a path');
        expect(fromProblem('//example.com/a')).toContain('is not a path');
        expect(fromProblem('https://example.com/a')).toContain('is not a path');
        expect(fromProblem('/a#top')).toContain('#');
        expect(fromProblem('/sommer salg')).toContain('space');
    });
});

describe('targetProblem', () => {
    it('takes a path on the site and a web address', () => {
        expect(
            targetProblem({
                type: 'path',
                path: '/produkter/eik#pris',
            })
        ).toBeUndefined();
        expect(
            targetProblem({
                type: 'url',
                url: 'https://hagen.example.no/produkter',
            })
        ).toBeUndefined();
    });

    it('refuses a path of another host, and an address that is not on the web', () => {
        expect(
            targetProblem({
                type: 'path',
                path: '//example.com',
            })
        ).toContain('is not a path');
        expect(
            targetProblem({
                type: 'url',
                url: 'javascript:alert(1)',
            })
        ).toContain('https://');
        expect(
            targetProblem({
                type: 'url',
                url: 'example.com',
            })
        ).toContain('is not a URL');
    });
});

describe('planRedirect', () => {
    it('stores a new redirect as given', () => {
        expect(
            planRedirect([shop], {
                from: '/jul',
                to: {
                    type: 'url',
                    url: 'https://hagen.example.no/jul',
                },
            })
        ).toEqual({
            to: {
                type: 'url',
                url: 'https://hagen.example.no/jul',
            },
            repointed: [],
        });
    });

    it("stores a path target that is another redirect's from as that redirect's target", () => {
        expect(
            planRedirect([shop], {
                from: '/oslo',
                to: {
                    type: 'path',
                    path: '/butikker/oslo',
                },
            })
        ).toEqual({
            to: shop.to,
            repointed: [],
        });
    });

    it('follows a path target past its query too, and ignores its fragment', () => {
        const old: PlannedRedirect = {
            id: 'old',
            from: '/produkt.php?id=12',
            to: {
                type: 'path',
                path: '/produkter/eik',
            },
        };
        expect(
            planRedirect([old], {
                from: '/eik',
                to: {
                    type: 'path',
                    path: '/produkt.php?id=12#pris',
                },
            })
        ).toEqual({
            to: old.to,
            repointed: [],
        });
    });

    it('points the redirects that led to its from where it now goes', () => {
        const toCampaign: PlannedRedirect = {
            id: 'campaign',
            from: '/tilbud',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
        };
        expect(
            planRedirect([toCampaign, shop], {
                from: '/kampanjer/sommer',
                to: {
                    type: 'path',
                    path: '/kampanjer/host',
                },
            })
        ).toEqual({
            to: {
                type: 'path',
                path: '/kampanjer/host',
            },
            repointed: [
                {
                    ...toCampaign,
                    to: {
                        type: 'path',
                        path: '/kampanjer/host',
                    },
                },
            ],
        });
    });

    it('refuses a from another redirect has', () => {
        const plan = planRedirect([shop], {
            from: '/butikker/oslo',
            to: {
                type: 'path',
                path: '/butikker',
            },
        });
        expect(plan).toMatchObject({
            refusal: expect.stringContaining('redirects already'),
            taken: shop,
        });
    });

    it('lets a redirect keep its own from when it changes', () => {
        expect(
            planRedirect([summer], {
                id: 'summer',
                from: '/sommer',
                to: {
                    type: 'path',
                    path: '/kampanjer/host',
                },
            })
        ).toEqual({
            to: {
                type: 'path',
                path: '/kampanjer/host',
            },
            repointed: [],
        });
    });

    it('refuses a redirect to itself', () => {
        expect(
            planRedirect([], {
                from: '/sommer',
                to: {
                    type: 'path',
                    path: '/sommer#top',
                },
            })
        ).toEqual({
            refusal: '/sommer cannot redirect to itself.',
        });
    });

    it('refuses a save that leads back to its own from through another redirect', () => {
        expect(
            planRedirect([summer], {
                from: '/kampanjer/sommer',
                to: {
                    type: 'path',
                    path: '/sommer',
                },
            })
        ).toEqual({
            refusal: '/sommer redirects back to /kampanjer/sommer, so visitors would go round in a circle.',
        });
    });
});
