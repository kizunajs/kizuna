import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// Every app runs two folders below the demo, so all of them share one outbox.
const ROOT = process.env.KIZUNA_OUTBOX_ROOT ?? resolve(/* turbopackIgnore: true */ process.cwd(), '../../.outbox');

/**
 * The API key the Resend plugin sends with while the demo has none of its own.
 */
export const OUTBOX_API_KEY = 're_demo_outbox';

/**
 * Where the Resend plugin sends while `RESEND_API_KEY` is unset: the app's own
 * outbox route, at `/api/demo-resend`.
 */
export const outboxUrl = (siteUrl: string): string => `${siteUrl}/api/demo-resend`;

const failure = (status: number, message: string): Response =>
    Response.json(
        {
            name: 'application_error',
            message,
        },
        {
            status,
        }
    );

/**
 * Stands in for Resend while the demo has no API key. It answers a sent email
 * or broadcast as Resend would, writes its HTML to the demo's `.outbox/`
 * folder, and logs who it was for.
 */
export const receiveInOutbox = async (request: Request, path: string): Promise<Response> => {
    if (process.env.RESEND_API_KEY !== undefined) return failure(404, 'The outbox is off while RESEND_API_KEY is set.');
    if (request.headers.get('authorization') !== `Bearer ${OUTBOX_API_KEY}`) return failure(401, 'This is not the outbox key.');
    const kind = path === 'emails' ? 'email' : path === 'broadcasts' ? 'broadcast' : undefined;
    if (kind === undefined) return failure(404, `The outbox takes emails and broadcasts, not '${path}'.`);

    const sent = (await request.json()) as {
        subject?: string;
        html?: string;
        to?: string | string[];
        segment_id?: string;
    };
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${kind}`;
    const file = join(ROOT, `${id}.html`);
    await mkdir(ROOT, {
        recursive: true,
    });
    await writeFile(file, sent.html ?? '');

    const recipients = kind === 'email' ? [sent.to ?? []].flat().join(', ') : `segment ${sent.segment_id ?? 'unknown'}`;
    console.info(`[outbox] ${kind} "${sent.subject ?? ''}" to ${recipients}, saved to ${file}`);
    return Response.json({
        id,
    });
};
