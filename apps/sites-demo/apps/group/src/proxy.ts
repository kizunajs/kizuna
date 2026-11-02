import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { contentProxy } from '@kizunajs/cms/next/proxy';
import { sites } from '@kizunajs-demo/sites-content';

const redirects = contentProxy({
    cms: `${sites.values.group.url}/api`,
    site: 'group',
});

/**
 * Sends an old address to where its page is now.
 */
export async function proxy(request: NextRequest, event: NextFetchEvent): Promise<NextResponse> {
    return (await redirects(request, event)) ?? NextResponse.next();
}

export const config = {
    // Dotted paths reach the proxy too, so an old address like /annual-report.pdf can redirect.
    matcher: ['/((?!api|admin|_next|icons).*)'],
};
