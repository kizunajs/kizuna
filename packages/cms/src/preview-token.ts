import { createHmac, timingSafeEqual } from 'node:crypto';

const DEV_SECRET = 'kizuna-cms-development-preview-secret';

/**
 * How long a preview token lasts.
 */
export const PREVIEW_TTL_SECONDS = 600;

/**
 * The cookie that holds a preview token while draft mode is on. Drafts show
 * only while it verifies, and the preview overlay renews it through a route
 * only a signed-in editor reaches, so drafts stop showing within minutes of
 * the editor signing out.
 */
export const PREVIEW_COOKIE = 'kizuna-cms-preview';

/**
 * The secret preview tokens are signed with: the plugin's `previewSecret`, or
 * `KIZUNA_CMS_PREVIEW_SECRET`. Production refuses to run without one.
 */
export const previewSecret = (configured: string | undefined): string => {
    const secret = configured ?? process.env['KIZUNA_CMS_PREVIEW_SECRET'];
    if (secret !== undefined && secret !== '') return secret;
    if (process.env['NODE_ENV'] === 'production') {
        throw new Error('Set KIZUNA_CMS_PREVIEW_SECRET, or `previewSecret` on cms(). Draft mode is signed with it.');
    }
    return DEV_SECRET;
};

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');

const signature = (secret: string, payload: string): string => createHmac('sha256', secret).update(payload).digest('base64url');

/**
 * A short-lived token that lets a signed-in editor enter draft mode.
 */
export const signPreviewToken = (secret: string, ttlSeconds = PREVIEW_TTL_SECONDS, now = Date.now()): string => {
    const payload = encode(String(now + ttlSeconds * 1000));
    return `${payload}.${signature(secret, payload)}`;
};

/**
 * Whether a token was signed with the secret and has not expired.
 */
export const verifyPreviewToken = (secret: string, token: string, now = Date.now()): boolean => {
    const [payload, given] = token.split('.');
    if (payload === undefined || given === undefined) return false;
    const expected = signature(secret, payload);
    if (expected.length !== given.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return false;
    const expires = Number(Buffer.from(payload, 'base64url').toString('utf8'));
    return Number.isFinite(expires) && expires > now;
};
