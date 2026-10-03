import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewDocument, previewProxyUrl, previewStylesheet, proxied, proxyToSite } from './preview-proxy.js';

const target = {
    site: 'http://localhost:3030',
    proxy: 'http://localhost:3030/cms-api/preview/proxy',
    token: 'abc',
};

const page = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/_next/static/css/app.css" data-precedence="next"><link rel="preload" href="/_next/static/media/font.woff2" as="font" crossorigin><link rel="preload" as="script" href="/_next/static/chunks/main.js"><script src="/_next/static/chunks/main.js" async></script></head><body><h1>Plants for every room</h1><img src="/cms-api/content/media/med_1/image"><script>self.__next_f.push([1,"payload"])</script></body></html>`;

describe('the preview proxy', () => {
    it('serves the site from the CMS mount', () => {
        expect(previewProxyUrl('http://localhost:3030', '/cms-api', '')).toBe('http://localhost:3030/cms-api/preview/proxy');
    });

    it("routes the site's own URLs through itself, and nothing else", () => {
        expect(proxied(target, '/_next/static/css/app.css')).toBe(
            'http://localhost:3030/cms-api/preview/proxy?token=abc&path=%2F_next%2Fstatic%2Fcss%2Fapp.css'
        );
        expect(proxied(target, 'https://fonts.example.com/a.woff2')).toBeUndefined();
    });

    it('serves a page without its scripts, with a base, its images on the site, and its stylesheets and fonts through itself', () => {
        const html = previewDocument(page, 'http://localhost:3030/', target);
        expect(html).not.toContain('<script');
        expect(html).not.toContain('as="script"');
        expect(html).toContain('<head><base href="http://localhost:3030/">');
        expect(html).toContain('href="http://localhost:3030/cms-api/preview/proxy?token=abc&amp;path=%2F_next%2Fstatic%2Fcss%2Fapp.css"');
        expect(html).toContain(
            'href="http://localhost:3030/cms-api/preview/proxy?token=abc&amp;path=%2F_next%2Fstatic%2Fmedia%2Ffont.woff2"'
        );
        expect(html).toContain('<img src="http://localhost:3030/cms-api/content/media/med_1/image">');
    });

    it("loads a stylesheet's fonts through itself, resolved against the sheet", () => {
        const css = previewStylesheet(
            '@font-face{src:url(../media/font.woff2)}body{background:url("data:image/png;base64,AA")}',
            'http://localhost:3030/_next/static/css/app.css',
            target
        );
        expect(css).toContain('url(http://localhost:3030/cms-api/preview/proxy?token=abc&path=%2F_next%2Fstatic%2Fmedia%2Ffont.woff2)');
        expect(css).toContain('url("data:image/png;base64,AA")');
    });

    it('points images, srcsets and inline styles at the site, since a host may refuse the base', () => {
        const html = previewDocument(
            `<html><head><link rel="preload" as="image" imageSrcSet="/_next/image?url=%2Fa.jpg&amp;w=640 640w, /_next/image?url=%2Fa.jpg&amp;w=1080 1080w"></head><body><img srcSet="/_next/image?url=%2Fa.jpg&amp;w=640&amp;q=75 1x, /b,c.jpg 2x" src="../hero.jpg"><video poster="/poster.jpg"></video><div style="background-image:url('/bg.jpg');mask:url(data:image/png;base64,AA)"></div><img src="data:image/gif;base64,R0"><img src="https://cdn.example.com/x.jpg"></body></html>`,
            'http://localhost:3030/blog/spring',
            target
        );
        expect(html).toContain(
            'imageSrcSet="http://localhost:3030/_next/image?url=%2Fa.jpg&amp;w=640 640w, http://localhost:3030/_next/image?url=%2Fa.jpg&amp;w=1080 1080w"'
        );
        expect(html).toContain(
            'srcSet="http://localhost:3030/_next/image?url=%2Fa.jpg&amp;w=640&amp;q=75 1x, http://localhost:3030/b,c.jpg 2x"'
        );
        expect(html).toContain('src="http://localhost:3030/hero.jpg"');
        expect(html).toContain('poster="http://localhost:3030/poster.jpg"');
        expect(html).toContain("background-image:url('http://localhost:3030/bg.jpg')");
        expect(html).toContain('mask:url(data:image/png;base64,AA)');
        expect(html).toContain('src="data:image/gif;base64,R0"');
        expect(html).toContain('src="https://cdn.example.com/x.jpg"');
    });

    it("puts the site's address on images, posters and inline styles, since Claude's sandbox ignores <base>", () => {
        const html = previewDocument(
            `<html><head></head><body><img src="/hero.webp" srcset="/_next/image?url=%2Fhero.webp&amp;w=640 640w, /_next/image?url=a,b&amp;w=1080 1080w"><video poster="/poster.jpg"></video><div style="background:url('/texture.png')"></div><img src="https://cdn.example.com/x.png"><img src="data:image/png;base64,AA"><a href="#top">Top</a></body></html>`,
            'http://localhost:3030/team',
            target
        );
        expect(html).toContain('src="http://localhost:3030/hero.webp"');
        expect(html).toContain(
            'srcset="http://localhost:3030/_next/image?url=%2Fhero.webp&amp;w=640 640w, http://localhost:3030/_next/image?url=a,b&amp;w=1080 1080w"'
        );
        expect(html).toContain('poster="http://localhost:3030/poster.jpg"');
        expect(html).toContain("url('http://localhost:3030/texture.png')");
        expect(html).toContain('src="https://cdn.example.com/x.png"');
        expect(html).toContain('src="data:image/png;base64,AA"');
        expect(html).toContain('href="#top"');
    });

    it('leaves out documents a page embeds and refreshes it would follow', () => {
        const html = previewDocument(
            '<html><head><meta http-equiv="refresh" content="0;url=https://elsewhere.example"></head><body><iframe src="https://elsewhere.example"></iframe><object data="x.swf"></object><embed src="x.svg"><p>Kept</p></body></html>',
            'http://localhost:3030/',
            target
        );
        expect(html).not.toContain('refresh');
        expect(html).not.toContain('<iframe');
        expect(html).not.toContain('<object');
        expect(html).not.toContain('<embed');
        expect(html).toContain('<p>Kept</p>');
    });
});

describe('proxying to the site', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const site = (answer: Response) =>
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            if (String(input).includes('/draft?')) {
                return new Response(null, {
                    status: 307,
                    headers: {
                        'set-cookie': 'kizuna-cms-preview=held; Path=/',
                        location: '/',
                    },
                });
            }
            return answer;
        });

    it('refuses a file when the editor loads a page, without downloading it', async () => {
        site(
            new Response('%PDF-1.7', {
                headers: {
                    'content-type': 'application/pdf',
                },
            })
        );
        const response = await proxyToSite({
            target: {
                ...target,
                token: 'pdf',
            },
            draftPath: '/cms-api/draft',
            path: '/files/price-list.pdf',
            headers: {},
            ttlMs: 60_000,
            document: true,
        });
        expect(response.status).toBe(415);
        expect(response.headers.get('x-kizuna-preview-type')).toBe('application/pdf');
        expect(await response.text()).toBe('');
    });

    it('refuses anything off the site', async () => {
        const fetching = site(new Response('never'));
        const response = await proxyToSite({
            target,
            draftPath: '/cms-api/draft',
            path: '//elsewhere.example/steal',
            headers: {},
            ttlMs: 60_000,
        });
        expect(response.status).toBe(400);
        expect(fetching).not.toHaveBeenCalled();
    });
});
