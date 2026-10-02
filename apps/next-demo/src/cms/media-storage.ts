import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { MediaStorage } from '@kizunajs/cms';

const ROOT = '.media';
const SECRET = process.env.BETTER_AUTH_SECRET ?? 'kizuna-demo-secret-set-BETTER_AUTH_SECRET-anywhere-real';
const ORIGIN = process.env.BETTER_AUTH_URL ?? 'http://localhost:3030';
const KEY = /^(uploads|media)\/[A-Za-z0-9._-]+$/;

const signature = (key: string, expires: number): string => createHmac('sha256', SECRET).update(`${key}:${expires}`).digest('base64url');

const pathOf = (key: string): string => {
    if (!KEY.test(key)) throw new Error(`'${key}' is not a media key.`);
    return join(ROOT, key);
};

/**
 * Whether a PUT to the upload route carries a signature this storage issued
 * and has not expired.
 */
export const verifyUploadUrl = (key: string, expires: string | null, given: string | null): boolean => {
    if (!KEY.test(key) || expires === null || given === null || Number(expires) < Date.now()) return false;
    const expected = signature(key, Number(expires));
    return expected.length === given.length && timingSafeEqual(Buffer.from(expected), Buffer.from(given));
};

export const writeUpload = async (key: string, bytes: Uint8Array): Promise<void> => {
    const path = pathOf(key);
    await mkdir(dirname(path), {
        recursive: true,
    });
    await writeFile(path, bytes);
};

/**
 * Files on disk under `.media/`, so the demo uploads without a bucket. The
 * presigned URL points at the demo's own upload route. Set `CMS_S3_BUCKET` and
 * the CMS uses S3 instead.
 */
export const localMediaStorage: MediaStorage = {
    presignUpload: async ({ key, contentType, expiresIn }) => {
        const expires = Date.now() + expiresIn * 1000;
        return {
            url: `${ORIGIN}/api/demo-uploads/${key}?expires=${expires}&signature=${signature(key, expires)}`,
            headers: {
                'content-type': contentType,
            },
        };
    },
    head: async (key) => {
        try {
            const found = await stat(pathOf(key));
            return {
                size: found.size,
                contentType: undefined,
            };
        } catch {
            return undefined;
        }
    },
    get: async (key) => {
        try {
            return new Uint8Array(await readFile(pathOf(key)));
        } catch {
            return undefined;
        }
    },
    put: (key, bytes) => writeUpload(key, bytes),
    delete: async (key) => {
        await rm(pathOf(key), {
            force: true,
        });
    },
};
