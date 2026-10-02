import { draftMode } from 'next/headers';
import { NextResponse } from 'next/server';
import { previewSecret, verifyPreviewToken } from './preview-token.js';

/**
 * A same-origin path, or `/` for anything else, so the route never sends
 * someone off the site.
 */
const safeRedirect = (value: string | null): string => (value !== null && value.startsWith('/') && !value.startsWith('//') ? value : '/');

/**
 * The route handler that opens and closes draft mode:
 * `GET /api/draft?token=…&redirect=/blog/spring-sale` enables it for a token the API
 * minted, `GET /api/draft?disable=1&redirect=/` turns it off.
 */
export const createDraftRoute = (options?: { secret?: string }) =>
    async function GET(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const draft = await draftMode();
        const target = new URL(safeRedirect(url.searchParams.get('redirect')), url);
        if (url.searchParams.has('disable')) {
            draft.disable();
            return NextResponse.redirect(target);
        }
        const token = url.searchParams.get('token');
        if (token === null || !verifyPreviewToken(previewSecret(options?.secret), token)) {
            return new NextResponse('The preview token is missing or has expired. Open the preview again from the CMS.', {
                status: 401,
            });
        }
        draft.enable();
        return NextResponse.redirect(target);
    };

/**
 * The draft mode route, signed with `KIZUNA_CMS_PREVIEW_SECRET`. Re-export it
 * from `app/api/draft/route.ts`.
 */
export const GET = createDraftRoute();
