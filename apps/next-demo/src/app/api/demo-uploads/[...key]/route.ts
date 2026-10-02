import { verifyUploadUrl, writeUpload } from '../../../../cms/media-storage';

/**
 * Where the browser sends a file the CMS presigned, standing in for a bucket.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ key: string[] }> }): Promise<Response> {
    const key = (await params).key.join('/');
    const url = new URL(request.url);
    if (!verifyUploadUrl(key, url.searchParams.get('expires'), url.searchParams.get('signature'))) {
        return new Response('The upload URL is invalid or has expired.', {
            status: 403,
        });
    }
    await writeUpload(key, new Uint8Array(await request.arrayBuffer()));
    return new Response(null, {
        status: 200,
    });
}
