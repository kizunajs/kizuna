import { afterEach, describe, expect, it, vi } from 'vitest';
import { previewSecret, signPreviewToken, verifyPreviewToken } from './preview-token.js';

describe('preview tokens', () => {
    it('verify with the secret they were signed with', () => {
        const token = signPreviewToken('secret', 600, 1_000_000);
        expect(verifyPreviewToken('secret', token, 1_000_000 + 1000)).toBe(true);
        expect(verifyPreviewToken('other', token, 1_000_000 + 1000)).toBe(false);
    });

    it('stop working when they expire', () => {
        const token = signPreviewToken('secret', 600, 1_000_000);
        expect(verifyPreviewToken('secret', token, 1_000_000 + 601_000)).toBe(false);
    });

    it('reject a forged payload', () => {
        const [, signature] = signPreviewToken('secret', 600, 1_000_000).split('.');
        const forged = `${Buffer.from(String(Date.now() + 10_000_000)).toString('base64url')}.${signature}`;
        expect(verifyPreviewToken('secret', forged)).toBe(false);
        expect(verifyPreviewToken('secret', 'nonsense')).toBe(false);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('refuses to run production without a secret', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('KIZUNA_CMS_PREVIEW_SECRET', '');
        expect(() => previewSecret(undefined)).toThrow('KIZUNA_CMS_PREVIEW_SECRET');
        expect(previewSecret('configured')).toBe('configured');
    });
});
