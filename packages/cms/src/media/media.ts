import { createHash, randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { FocalPointSchema } from '../image.js';
import type { DocumentStore } from '../storage/store.js';
import type { MediaStorage } from './storage.js';
import { inspectImage, NotAnImageError, renderImage, stripMetadata, type RenderOptions } from './inspect.js';

/**
 * What a media document records about its file.
 */
export interface MediaRecord {
    id: string;
    key: string;
    contentType: string;
    size: number;
    width: number;
    height: number;
    filename: string;
    alt: string;
    focalPoint?: z.output<typeof FocalPointSchema>;
    uploadedAt: string;
    uploadedBy: string;
}

/**
 * Why an upload was refused.
 */
export class UploadRejectedError extends Error {}

const UPLOAD_PREFIX = 'uploads/';
const MEDIA_PREFIX = 'media/';

export interface MediaServiceOptions {
    store: DocumentStore;
    storage: MediaStorage;
    maxBytes: number;
}

const safeFilename = (filename: string): string => filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

/**
 * Uploads land in storage, are checked by their bytes with sharp, lose their
 * metadata, and become a media document named by their content hash, so the
 * same file uploaded twice, or pushed between environments, is one item.
 */
export class MediaService {
    constructor(private readonly options: MediaServiceOptions) {}

    get maxBytes(): number {
        return this.options.maxBytes;
    }

    async createUpload(input: { filename: string; contentType: string; size: number }): Promise<{
        uploadId: string;
        url: string;
        headers: Record<string, string>;
        maxBytes: number;
    }> {
        if (input.size > this.options.maxBytes) {
            throw new UploadRejectedError(`The file is ${input.size} bytes. Uploads are limited to ${this.options.maxBytes} bytes.`);
        }
        if (!input.contentType.startsWith('image/') || input.contentType === 'image/svg+xml') {
            throw new UploadRejectedError('Uploads are JPEG, PNG, WebP, GIF or AVIF images.');
        }
        const uploadId = `${randomUUID()}-${safeFilename(input.filename)}`;
        const presigned = await this.options.storage.presignUpload({
            key: `${UPLOAD_PREFIX}${uploadId}`,
            contentType: input.contentType,
            size: input.size,
            expiresIn: 900,
        });
        return {
            uploadId,
            url: presigned.url,
            headers: presigned.headers,
            maxBytes: this.options.maxBytes,
        };
    }

    /**
     * Checks the uploaded bytes and makes the media document, or refuses and
     * removes the upload.
     */
    async completeUpload(uploadId: string, author: string): Promise<MediaRecord> {
        if (!/^[A-Za-z0-9._-]+$/.test(uploadId)) throw new UploadRejectedError('Unknown upload.');
        const key = `${UPLOAD_PREFIX}${uploadId}`;
        const head = await this.options.storage.head(key);
        if (head === undefined) throw new UploadRejectedError('Nothing was uploaded yet.');
        if (head.size > this.options.maxBytes) {
            await this.options.storage.delete(key);
            throw new UploadRejectedError(`The file is ${head.size} bytes. Uploads are limited to ${this.options.maxBytes} bytes.`);
        }
        const bytes = await this.options.storage.get(key);
        if (bytes === undefined) throw new UploadRejectedError('Nothing was uploaded yet.');
        return this.storeBytes(bytes, uploadId.slice(37), author, key);
    }

    /**
     * Stores bytes that arrived some other way, such as `kizuna cms push`.
     */
    async storeBytes(bytes: Uint8Array, filename: string, author: string, uploadKey?: string): Promise<MediaRecord> {
        let inspected;
        try {
            inspected = await inspectImage(bytes);
        } catch (error) {
            if (uploadKey !== undefined) await this.options.storage.delete(uploadKey);
            if (error instanceof NotAnImageError) throw new UploadRejectedError(error.message);
            throw error;
        }
        const stripped = await stripMetadata(bytes, inspected);
        const size = inspected.hasExif ? await inspectImage(stripped) : inspected;
        const hash = createHash('sha256').update(stripped).digest('hex').slice(0, 24);
        const id = `med_${hash}`;
        const mediaKey = `${MEDIA_PREFIX}${hash}.${inspected.extension}`;
        const existing = await this.get(id);
        if (existing !== undefined) {
            if (uploadKey !== undefined) await this.options.storage.delete(uploadKey);
            return existing;
        }
        await this.options.storage.put(mediaKey, stripped, inspected.contentType);
        if (uploadKey !== undefined) await this.options.storage.delete(uploadKey);
        const record: MediaRecord = {
            id,
            key: mediaKey,
            contentType: inspected.contentType,
            size: stripped.byteLength,
            width: size.width,
            height: size.height,
            filename: safeFilename(filename) || `${hash}.${inspected.extension}`,
            alt: '',
            uploadedAt: new Date().toISOString(),
            uploadedBy: author,
        };
        await this.options.store.saveMedia(id, record as unknown as Record<string, unknown>, author);
        return record;
    }

    async get(id: string): Promise<MediaRecord | undefined> {
        const row = await this.options.store.get('media', id);
        return row?.published === null || row?.published === undefined ? undefined : (row.published as unknown as MediaRecord);
    }

    async list(): Promise<MediaRecord[]> {
        const rows = await this.options.store.list('media');
        return rows.filter((row) => row.published !== null).map((row) => row.published as unknown as MediaRecord);
    }

    async update(id: string, changes: Partial<Pick<MediaRecord, 'alt' | 'focalPoint'>>, author: string): Promise<MediaRecord | undefined> {
        const current = await this.get(id);
        if (current === undefined) return undefined;
        const next: MediaRecord = {
            ...current,
            ...(changes.alt === undefined ? {} : { alt: changes.alt }),
            ...(changes.focalPoint === undefined ? {} : { focalPoint: changes.focalPoint }),
        };
        await this.options.store.saveMedia(id, next as unknown as Record<string, unknown>, author);
        return next;
    }

    /**
     * The stored bytes, for `kizuna cms push`.
     */
    async bytes(record: MediaRecord): Promise<Uint8Array | undefined> {
        return this.options.storage.get(record.key);
    }

    /**
     * The image as a page shows it, rendered by sharp from the stored file.
     */
    async render(record: MediaRecord, options: RenderOptions): Promise<Uint8Array | undefined> {
        const bytes = await this.options.storage.get(record.key);
        if (bytes === undefined) return undefined;
        return renderImage(bytes, record, options);
    }
}
