import { hostPage, otherOrigin } from '../../../dev/claude-host';

/**
 * `/dev/claude?url=/team`: the CMS editor as Claude shows it, opened on a
 * page, for debugging in a browser while signed in. `frames=1` makes the host
 * approve framing the site, as hosts that honour `frameDomains` do.
 */
export async function GET(request: Request): Promise<Response> {
    if (process.env.NODE_ENV === 'production') {
        return new Response(null, {
            status: 404,
        });
    }
    const url = new URL(request.url);
    const framesSite = url.searchParams.get('frames') === '1';
    const view = new URL('/dev/claude/view', otherOrigin(url.origin));
    view.searchParams.set('site', url.origin);
    if (framesSite) view.searchParams.set('frames', '1');
    return new Response(
        hostPage({
            viewUrl: view.toString(),
            site: url.origin,
            framesSite,
            opening: {
                name: 'editing_describe',
                arguments: {
                    query: {
                        url: url.searchParams.get('url') ?? '/',
                    },
                },
            },
        }),
        {
            headers: {
                'content-type': 'text/html; charset=utf-8',
            },
        }
    );
}
