import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_HEADER, servedLocales } from './lib/languages';

/**
 * Serves the site's other languages under their code: `/en/offices` renders
 * `/offices` in English. The first language sits at the root, so its own
 * prefix redirects there.
 */
export function proxy(request: NextRequest): NextResponse {
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
    matcher: ['/((?!api|admin|_next|icons|.*\\..*).*)'],
};
