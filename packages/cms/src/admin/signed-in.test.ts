import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignedIn } from './signed-in.js';

const LONG_NAME =
    'Ingrid Margrethe Solberg-Haugland is the editor who looks after every page about the lamp workshop. She signs in from the shared laptop in the front office.';

const render = (signOutPath: string | null, signOutMethod: 'GET' | 'POST' = 'GET'): string =>
    renderToStaticMarkup(
        createElement(SignedIn, {
            person: {
                id: 'ingrid',
                name: LONG_NAME,
            },
            role: 'contentEditor',
            signOutPath,
            signOutMethod,
        })
    );

describe('SignedIn', () => {
    it('opens a menu from the whole row, the name and the role a line each', () => {
        const html = render('/logout');
        const trigger = html.match(/<button[^>]*k-sidebar__account[^>]*>(.*)<\/button>/)?.[1];
        expect(html).toContain('aria-haspopup="menu"');
        expect(trigger).toContain(`<span class="k-ellipsis">${LONG_NAME}</span>`);
        expect(trigger).toContain('<span class="k-sidebar__role k-ellipsis">Content editor</span>');
    });

    it('signs out with a form the menu sends, when the CMS signs out by POST', () => {
        const html = render('/cms-api/sign-out', 'POST');
        const form = html.match(/<form[^>]*>/)?.[0];
        expect(form).toContain('method="post"');
        expect(form).toContain('action="/cms-api/sign-out"');
        expect(html).toContain('aria-haspopup="menu"');
    });

    it('shows the editor as plain text when there is nowhere to sign out', () => {
        const html = render(null);
        expect(html).not.toContain('<button');
        expect(html).toContain(`<span class="k-ellipsis">${LONG_NAME}</span>`);
    });
});
