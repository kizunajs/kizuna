import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { k } from './k';

/**
 * The token the demo's stand-in authorization server issued the travel
 * agency, which it reads Hagen's content with.
 */
const TRAVEL_AGENCY_READ_TOKEN = process.env.TRAVEL_AGENCY_READ_TOKEN ?? 'demo-travel-agency-read-token';

/**
 * The token the travel agency gave Hagen, which Hagen sends to its
 * `invalidate` route.
 */
const TRAVEL_AGENCY_INVALIDATE_TOKEN = process.env.TRAVEL_AGENCY_INVALIDATE_TOKEN ?? 'demo-travel-agency-invalidate-token';

/**
 * The tokens the stand-in authorization server has issued, by the partner each
 * one signs in. A real deployment verifies an OAuth client credentials token
 * here, and maps its client to the partner.
 */
const issued = new Map([[TRAVEL_AGENCY_READ_TOKEN, 'travelAgency']]);

const partnerOf = (token: string): string | undefined => {
    for (const [candidate, partner] of issued) {
        if (candidate.length === token.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(token))) return partner;
    }
    return undefined;
};

/**
 * A business outside Hagen that reads its content with a token. Images stay
 * public, since a visitor's browser loads them from a page without one.
 */
export const partner = k.identity
    .bearer({
        context: z.object({
            partner: z.string().optional(),
        }),
    })
    .guard(({ bearer, request, deny }) => {
        if (bearer === null && new URL(request.url).pathname.includes('/content/media/')) return {};
        const found = bearer === null ? undefined : partnerOf(bearer.token);
        if (found === undefined) {
            return deny({
                status: 401,
                body: {
                    detail: 'Sign in with the token your authorization server issued.',
                },
            });
        }
        return {
            partner: found,
        };
    });

/**
 * The businesses that show Hagen's content on their own websites. The travel
 * agency sells the UK's workshops as day trips, so it reads the UK.
 */
export const partners = {
    travelAgency: {
        label: 'Travel agency',
        reads: ['uk'],
        invalidate: {
            url: process.env.TRAVEL_AGENCY_INVALIDATE_URL ?? 'http://partner.localhost:3046/api/invalidate',
            headers: () => ({
                authorization: `Bearer ${TRAVEL_AGENCY_INVALIDATE_TOKEN}`,
            }),
        },
    },
};
