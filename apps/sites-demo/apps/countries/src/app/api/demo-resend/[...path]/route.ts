import { receiveInOutbox } from '@kizunajs-demo/sites-content/outbox';

/**
 * Where the Resend plugin sends while the demo has no `RESEND_API_KEY`,
 * standing in for Resend.
 */
export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
    return receiveInOutbox(request, (await params).path.join('/'));
}
