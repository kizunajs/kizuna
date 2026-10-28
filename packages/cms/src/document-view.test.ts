import { describe, expect, it } from 'vitest';
import { documentViewFor, STYLESHEET_PLACEHOLDER, withStylesheet } from './document-view.js';

describe('adminCss', () => {
    it('links the stylesheet where the page takes it, after its own styles', () => {
        expect(withStylesheet(`<style></style>${STYLESHEET_PLACEHOLDER}`, '/cms-admin.css')).toBe(
            '<style></style><link rel="stylesheet" href="/cms-admin.css">'
        );
    });

    it('leaves no trace without one', () => {
        expect(withStylesheet(`<style></style>${STYLESHEET_PLACEHOLDER}`, undefined)).toBe('<style></style>');
    });

    it('escapes the address as an attribute', () => {
        expect(withStylesheet(STYLESHEET_PLACEHOLDER, '/admin.css?a=1&b="2"')).toBe(
            '<link rel="stylesheet" href="/admin.css?a=1&amp;b=&quot;2&quot;">'
        );
    });

    it('loads a path from the site in the editor a chat host renders', async () => {
        const view = documentViewFor({
            preview: {
                url: 'https://site.example/blog',
            },
            adminCss: '/cms-admin.css',
        });
        expect(await view.html()).toContain('<link rel="stylesheet" href="https://site.example/cms-admin.css">');
        expect(view.csp?.resourceDomains).toContain('https://site.example');
    });

    it('lets the host load a stylesheet on another origin', () => {
        const view = documentViewFor({
            preview: {
                url: 'https://site.example',
            },
            adminCss: 'https://cdn.example/cms-admin.css',
        });
        expect(view.csp?.resourceDomains).toEqual(['https://site.example', 'https://cdn.example']);
    });
});
