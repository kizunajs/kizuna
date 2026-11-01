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
    /**
     * The site the image belongs to. Left out for a shared image.
     */
    site?: string;
    /**
     * The folder of its library the image sits in. Left out at the top level.
     */
    folder?: string;
}

/**
 * A folder of one library, the shared one or a site's.
 */
export interface MediaFolder {
    id: string;
    name: string;
    /**
     * The folder it sits in. Left out at the top level.
     */
    parent?: string;
    /**
     * The site whose library holds it. Left out in the shared library.
     */
    site?: string;
}

/**
 * Why an upload was refused.
 */
export class UploadRejectedError extends Error {}

/**
 * A folder change that conflicts with the library: a name taken beside it, a
 * folder moved into itself, or a folder deleted while it holds something.
 */
export class FolderConflictError extends Error {}

/**
 * A folder that is not in the library named.
 */
export class FolderNotFoundError extends Error {}

const MAX_FOLDER_NAME = 60;

const UPLOAD_PREFIX = 'uploads/';
const SHARED = 'default';
const MEDIA_PREFIX = 'media/';

export interface MediaServiceOptions {
    store: DocumentStore;
    storage: MediaStorage;
    maxBytes: number;
}

const safeFilename = (filename: string): string => filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);

/**
 * The content hash a stored file is named by, read from its storage key, so a
 * moved image is still found by its bytes.
 */
const hashOf = (key: string): string | undefined => /([0-9a-f]{24})(?:-[0-9a-f]+)?\.[a-z0-9]+$/.exec(key)?.[1];

const libraryOf = (site: string | undefined): string => site ?? SHARED;

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
     * removes the upload. With `site`, the new image belongs to that site;
     * without, it is shared. With `folder`, it lands in that folder.
     */
    async completeUpload(uploadId: string, author: string, site?: string, folder?: string): Promise<MediaRecord> {
        if (folder !== undefined) await this.assertFolderIn(folder, site);
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
        return this.storeBytes(bytes, uploadId.slice(37), author, key, site, folder);
    }

    /**
     * Stores bytes that arrived some other way, such as `kizuna cms push`.
     */
    async storeBytes(
        bytes: Uint8Array,
        filename: string,
        author: string,
        uploadKey?: string,
        site?: string,
        folder?: string
    ): Promise<MediaRecord> {
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
        // The same file uploaded twice to one library is one image, wherever it was first uploaded.
        const existing = (await this.inLibrary(site)).find((record) => hashOf(record.key) === hash);
        if (existing !== undefined) {
            if (uploadKey !== undefined) await this.options.storage.delete(uploadKey);
            return existing;
        }
        // A site's copy of a file is an image of its own, so deleting it leaves the shared one. An image moved
        // between libraries keeps its id, so a new upload of its file takes another.
        const base = site === undefined ? `med_${hash}` : `med_${site}_${hash}`;
        const taken = (await this.get(base)) !== undefined;
        const suffix = taken ? `-${randomUUID().replace(/-/g, '').slice(0, 8)}` : '';
        const id = taken ? `${base}_${suffix.slice(1)}` : base;
        const mediaKey =
            site === undefined
                ? `${MEDIA_PREFIX}${hash}${suffix}.${inspected.extension}`
                : `${MEDIA_PREFIX}${site}/${hash}${suffix}.${inspected.extension}`;
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
            ...(site === undefined
                ? {}
                : {
                      site,
                  }),
            ...(folder === undefined
                ? {}
                : {
                      folder,
                  }),
        };
        await this.options.store.saveMedia(id, record as unknown as Record<string, unknown>, author, site);
        return record;
    }

    async get(id: string): Promise<MediaRecord | undefined> {
        const row = await this.options.store.media(id);
        return row?.published === null || row?.published === undefined ? undefined : (row.published as unknown as MediaRecord);
    }

    /**
     * The shared images, and with `site`, that site's own beside them.
     */
    async list(site?: string): Promise<MediaRecord[]> {
        const rows = await this.options.store.list('media');
        return rows
            .filter((row) => row.published !== null && (row.site === SHARED || row.site === site))
            .map((row) => row.published as unknown as MediaRecord);
    }

    /**
     * One library's own images: the shared ones without `site`, or that
     * site's alone.
     */
    async inLibrary(site?: string): Promise<MediaRecord[]> {
        const rows = await this.options.store.list('media', libraryOf(site));
        return rows.filter((row) => row.published !== null).map((row) => row.published as unknown as MediaRecord);
    }

    /**
     * The shared folders, and with `site`, that site's own beside them.
     */
    async folders(site?: string): Promise<MediaFolder[]> {
        const rows = await this.options.store.list('folder');
        return rows
            .filter((row) => row.published !== null && (row.site === SHARED || row.site === site))
            .map((row) => row.published as unknown as MediaFolder)
            .sort((left, right) => left.name.localeCompare(right.name));
    }

    async folder(id: string): Promise<MediaFolder | undefined> {
        return (await this.allFolders()).find((folder) => folder.id === id);
    }

    /**
     * Makes a folder in a library, at its top level or inside `parent`.
     */
    async createFolder(input: { name: string; parent?: string }, site: string | undefined, author: string): Promise<MediaFolder> {
        const name = this.folderName(input.name);
        if (input.parent !== undefined) await this.assertFolderIn(input.parent, site);
        await this.assertNameFree(name, input.parent, site);
        const folder: MediaFolder = {
            id: `fld_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
            name,
            ...(input.parent === undefined
                ? {}
                : {
                      parent: input.parent,
                  }),
            ...(site === undefined
                ? {}
                : {
                      site,
                  }),
        };
        await this.options.store.saveFolder(folder.id, folder as unknown as Record<string, unknown>, author, libraryOf(site));
        return folder;
    }

    /**
     * Renames a folder, or moves it into another folder of its library, or
     * with `parent: null` to its top level.
     */
    async updateFolder(id: string, changes: { name?: string; parent?: string | null }, author: string): Promise<MediaFolder> {
        const current = await this.folder(id);
        if (current === undefined) throw new FolderNotFoundError(`No folder '${id}'.`);
        const name = changes.name === undefined ? current.name : this.folderName(changes.name);
        const parent = changes.parent === undefined ? current.parent : (changes.parent ?? undefined);
        if (parent !== undefined) {
            await this.assertFolderIn(parent, current.site);
            const folders = await this.allFolders();
            for (let step: string | undefined = parent; step !== undefined; step = folders.find((folder) => folder.id === step)?.parent) {
                if (step === id) throw new FolderConflictError(`The folder '${current.name}' cannot move into itself.`);
            }
        }
        if (name.toLowerCase() !== current.name.toLowerCase() || parent !== current.parent)
            await this.assertNameFree(name, parent, current.site, id);
        const { parent: _, ...rest } = current;
        const next: MediaFolder = {
            ...rest,
            name,
            ...(parent === undefined
                ? {}
                : {
                      parent,
                  }),
        };
        await this.options.store.saveFolder(id, next as unknown as Record<string, unknown>, author, libraryOf(current.site));
        return next;
    }

    /**
     * Deletes an empty folder. Refuses while it holds images or folders.
     */
    async deleteFolder(id: string): Promise<void> {
        const current = await this.folder(id);
        if (current === undefined) throw new FolderNotFoundError(`No folder '${id}'.`);
        const holdsImage = (await this.inLibrary(current.site)).some((record) => record.folder === id);
        const holdsFolder = (await this.allFolders()).some((folder) => folder.parent === id);
        if (holdsImage || holdsFolder) {
            throw new FolderConflictError(
                `The folder '${current.name}' holds ${holdsImage ? 'images' : 'folders'}. Move or delete them first.`
            );
        }
        await this.options.store.delete('folder', id, libraryOf(current.site));
    }

    /**
     * Moves images into a folder of a library, or into another library,
     * keeping their ids so every field holding one keeps showing it. Whether a
     * move into a site is allowed is the caller's to decide.
     */
    async move(ids: readonly string[], to: { site?: string; folder?: string }, author: string): Promise<MediaRecord[]> {
        if (to.folder !== undefined) await this.assertFolderIn(to.folder, to.site);
        const moved: MediaRecord[] = [];
        for (const id of ids) {
            const current = await this.get(id);
            if (current === undefined) continue;
            const { site: _, folder: __, ...rest } = current;
            const next: MediaRecord = {
                ...rest,
                ...(to.site === undefined
                    ? {}
                    : {
                          site: to.site,
                      }),
                ...(to.folder === undefined
                    ? {}
                    : {
                          folder: to.folder,
                      }),
            };
            if (current.site !== to.site) await this.options.store.moveToSite('media', id, libraryOf(to.site));
            await this.options.store.saveMedia(id, next as unknown as Record<string, unknown>, author, to.site);
            moved.push(next);
        }
        return moved;
    }

    private async allFolders(): Promise<MediaFolder[]> {
        const rows = await this.options.store.list('folder');
        return rows.filter((row) => row.published !== null).map((row) => row.published as unknown as MediaFolder);
    }

    private folderName(name: string): string {
        const trimmed = name.trim();
        if (trimmed === '' || trimmed.length > MAX_FOLDER_NAME) {
            throw new Error(`A folder's name is 1 to ${MAX_FOLDER_NAME} characters.`);
        }
        return trimmed;
    }

    private async assertFolderIn(id: string, site: string | undefined): Promise<void> {
        const folder = await this.folder(id);
        if (folder === undefined || folder.site !== site) {
            throw new FolderNotFoundError(
                `No folder '${id}' in ${site === undefined ? 'the shared library' : `the library of '${site}'`}.`
            );
        }
    }

    private async assertNameFree(name: string, parent: string | undefined, site: string | undefined, except?: string): Promise<void> {
        const taken = (await this.allFolders()).some(
            (folder) =>
                folder.id !== except && folder.site === site && folder.parent === parent && folder.name.toLowerCase() === name.toLowerCase()
        );
        if (taken) throw new FolderConflictError(`There is a folder named '${name}' there already.`);
    }

    /**
     * Sets the image's own alt text and focal point, which every use without
     * its own falls back to. A `null` focal point clears it.
     */
    async update(
        id: string,
        changes: {
            alt?: string;
            focalPoint?: MediaRecord['focalPoint'] | null;
        },
        author: string
    ): Promise<MediaRecord | undefined> {
        const current = await this.get(id);
        if (current === undefined) return undefined;
        const { focalPoint: _, ...rest } = current;
        const next: MediaRecord = {
            ...(changes.focalPoint === null ? rest : current),
            ...(changes.alt === undefined
                ? {}
                : {
                      alt: changes.alt,
                  }),
            ...(changes.focalPoint === undefined || changes.focalPoint === null
                ? {}
                : {
                      focalPoint: changes.focalPoint,
                  }),
        };
        await this.options.store.saveMedia(id, next as unknown as Record<string, unknown>, author, current.site);
        return next;
    }

    /**
     * Removes the media document and its stored file. An image a document in
     * the trash still holds goes to the trash instead, with its file, so
     * restoring that document brings it back, and it is erased once no
     * document holds it. Answers false when there was no such item.
     */
    async delete(id: string, by: string): Promise<boolean> {
        const current = await this.get(id);
        if (current === undefined) return false;
        if (await this.options.store.heldInTrash(IMAGE_BRAND, id)) {
            await this.options.store.trashMedia(id, by);
            return true;
        }
        await this.options.store.delete('media', id, current.site);
        await this.options.storage.delete(current.key);
        return true;
    }

    /**
     * Erases the images in the trash that no document holds any longer,
     * with their stored files. Answers how many went.
     */
    async eraseUnheld(): Promise<number> {
        const unheld = await this.options.store.unheldTrashedMedia(IMAGE_BRAND);
        for (const row of unheld) {
            await this.options.store.delete('media', row.key, row.site);
            const record = row.published as unknown as MediaRecord | null;
            if (record !== null) await this.options.storage.delete(record.key);
        }
        return unheld.length;
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
