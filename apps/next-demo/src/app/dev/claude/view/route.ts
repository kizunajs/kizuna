import { declaredCsp, editorPage, sandboxPolicy } from '../../../../dev/claude-host';

/**
 * The editor on its own origin, under the policy Claude's sandbox applies.
 */
export async function GET(request: Request): Promise<Response> {
    if (process.env.NODE_ENV === 'production') {
        return new Response(null, {
            status: 404,
        });
    }
    const url = new URL(request.url);
    const site = url.searchParams.get('site') ?? 'http://localhost:3030';
    return new Response(await editorPage(site), {
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': sandboxPolicy(
                await declaredCsp(site, request.headers.get('cookie') ?? ''),
                url.searchParams.get('frames') === '1'
            ),
        },
    });
}
