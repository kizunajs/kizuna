import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

/**
 * The token the agency gave Hagen for its calls to this route.
 */
const TOKEN = process.env.HAGEN_INVALIDATE_TOKEN ?? 'demo-travel-agency-invalidate-token';

/**
 * What Hagen sends when something the agency reads publishes, unpublishes or
 * is deleted. The agency reads items only, so a global or a page needs nothing.
 */
const InvalidateBodySchema = z.union([
    z.object({
        brand: z.string(),
        id: z.string(),
    }),
    z.object({
        global: z.string(),
    }),
    z.object({
        page: z.string(),
    }),
]);

const authorized = (header: string | null): boolean => {
    const expected = Buffer.from(`Bearer ${TOKEN}`);
    const given = Buffer.from(header ?? '');
    return expected.length === given.length && timingSafeEqual(expected, given);
};

/**
 * Drops the cached reads of the brand Hagen names, so the next visit reads it
 * again.
 */
export async function POST(request: Request): Promise<Response> {
    if (!authorized(request.headers.get('authorization'))) {
        return Response.json(
            {
                detail: 'Send the token the agency gave you.',
            },
            {
                status: 401,
                headers: {
                    'www-authenticate': 'Bearer',
                },
            }
        );
    }
    const parsed = InvalidateBodySchema.safeParse(await request.json().catch(() => undefined));
    if (!parsed.success) {
        return Response.json(
            {
                detail: 'Send { brand, id }, { global } or { page }.',
            },
            {
                status: 400,
            }
        );
    }
    if ('brand' in parsed.data) {
        revalidateTag(parsed.data.brand, {
            expire: 0,
        });
    }
    return new Response(null, {
        status: 204,
    });
}
