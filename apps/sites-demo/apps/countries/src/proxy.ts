import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { contentProxy } from '@kizunajs/cms/next/proxy';
import { sites } from '@kizunajs-demo/sites-content';
import { LOCALE_HEADER, servedLocales } from './lib/languages';

const site = process.env.KIZUNA_SITE as keyof typeof sites.values;

const redirects = contentProxy({
    cms: `${sites.values[site].url}/api`,
    site,
});

/**
 * Sends an old address to where its page is now, then serves the site's
 * other languages under their code: `/en/offices` renders `/offices` in
 * English. The first language sits at the root, so its own prefix redirects
 * there.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
    const redirected = await redirects(request, event);
    if (redirected !== undefined) return redirected;
    const [first, ...others] = servedLocales();
    const [, segment = '', ...rest] = request.nextUrl.pathname.split('/');
    const address = request.nextUrl.clone();
    address.pathname = `/${rest.join('/')}`;
    if (segment === first) return NextResponse.redirect(address);
    if (!others.includes(segment)) return NextResponse.next();
    const headers = new Headers(request.headers);
    headers.set(LOCALE_HEADER, segment);
    return NextResponse.rewrite(address, {
        request: {
            headers,
        },
    });
}

export const config = {
    // Dotted paths reach the proxy too, so an old address like /prisliste.pdf can redirect.
    matcher: ['/((?!api|admin|_next|icons).*)'],
};
