import { describe, expect, it } from 'vitest';
import {
    deleteRedirectQuestionOf,
    destinationOf,
    formOf,
    madeByOf,
    recreateBodyOf,
    redirectBodyOf,
    redirectCallOf,
    type RedirectView,
} from './redirects.js';

const renamed: RedirectView = {
    id: 'r1',
    from: '/butikker/oslo',
    to: {
        type: 'document',
        ref: 'item:norway:shops:k3j9x2',
        label: 'Oslo',
        path: '/butikker/oslo-sentrum',
    },
    status: 308,
    origin: 'rename',
    by: {
        id: 'ada',
        name: 'Ada Lovelace',
    },
    createdAt: '2026-11-01T09:00:00.000Z',
};

describe('redirectCallOf', () => {
    it("calls a site's redirects with several sites", () => {
        expect(
            redirectCallOf('norway', 'update', {
                id: 'r1',
                body: {
                    status: 307,
                },
            })
        ).toEqual({
            name: 'editing_sites_redirects_update',
            input: {
                params: {
                    site: 'norway',
                    id: 'r1',
                },
                body: {
                    status: 307,
                },
            },
        });
    });

    it("calls the CMS's own redirects with one site", () => {
        expect(
            redirectCallOf(undefined, 'list', {
                query: {
                    to: 'item:articles:k3j9x2',
                },
            })
        ).toEqual({
            name: 'editing_redirects_list',
            input: {
                query: {
                    to: 'item:articles:k3j9x2',
                },
            },
        });
    });
});

describe('madeByOf', () => {
    it('names the rename, the person, or the import', () => {
        expect(madeByOf(renamed)).toEqual({
            text: 'Renamed Oslo',
        });
        expect(
            madeByOf({
                ...renamed,
                origin: 'manual',
            })
        ).toEqual({
            person: renamed.by,
        });
        expect(
            madeByOf({
                ...renamed,
                origin: 'import',
                by: null,
            })
        ).toEqual({
            text: 'Import',
        });
    });
});

describe('destinationOf', () => {
    it("shows a document's name over where it is served, or that it is not published", () => {
        expect(destinationOf(renamed.to)).toEqual({
            title: 'Oslo',
            detail: '/butikker/oslo-sentrum',
        });
        expect(
            destinationOf({
                type: 'document',
                ref: 'item:norway:shops:k3j9x2',
                label: 'Oslo',
                path: null,
            })
        ).toEqual({
            title: 'Oslo',
            detail: 'Not published',
        });
        expect(
            destinationOf({
                type: 'url',
                url: 'https://example.com',
            })
        ).toEqual({
            title: 'https://example.com',
        });
    });
});

describe('redirectBodyOf', () => {
    it('sends what the dialog holds, trimmed, once every field is filled', () => {
        expect(
            redirectBodyOf({
                ...formOf(),
                from: ' /sommer ',
                mode: 'path',
                path: '/kampanjer/sommer',
            })
        ).toEqual({
            from: '/sommer',
            to: {
                type: 'path',
                path: '/kampanjer/sommer',
            },
            status: 308,
        });
        expect(
            redirectBodyOf({
                ...formOf(),
                from: '/sommer',
            })
        ).toBeUndefined();
    });

    it('sends nothing while From ends in /', () => {
        expect(
            redirectBodyOf({
                ...formOf(),
                from: '/sommer/',
                mode: 'path',
                path: '/',
            })
        ).toBeUndefined();
    });

    it('opens a redirect with its own values', () => {
        expect(formOf(renamed)).toEqual({
            from: '/butikker/oslo',
            mode: 'document',
            ref: 'item:norway:shops:k3j9x2',
            path: '',
            url: '',
            status: 308,
        });
    });
});

describe('the questions and Undo', () => {
    it('asks before deleting, and makes a removed redirect again by its document', () => {
        expect(deleteRedirectQuestionOf(renamed)).toBe(
            'Delete the redirect from /butikker/oslo? Visitors who ask for it get a page not found.'
        );
        expect(recreateBodyOf(renamed)).toEqual({
            from: '/butikker/oslo',
            to: {
                type: 'document',
                ref: 'item:norway:shops:k3j9x2',
            },
            status: 308,
        });
    });
});
