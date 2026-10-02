import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { DocumentStore, VersionConflictError } from './store.js';

let pglite: PGlite;
let store: DocumentStore;

beforeAll(async () => {
    pglite = new PGlite();
    store = new DocumentStore(drizzle(pglite));
    await store.createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('DocumentStore', () => {
    it('creates a document on the first draft and records a version', async () => {
        const saved = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'Spring',
            },
            author: 'ada',
            summary: 'First draft',
        });
        expect(saved.version).toBe(1);
        expect(saved.document.published).toBeNull();
        expect(saved.document.updatedBy).toBe('ada');
        expect(await store.versions(saved.document.id)).toMatchObject([
            {
                version: 1,
                summary: 'First draft',
                createdBy: 'ada',
            },
        ]);
    });

    it('refuses a write behind the latest version and keeps the newer one', async () => {
        const first = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'One',
            },
            author: 'ada',
        });
        await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'Two',
            },
            author: 'grace',
            ifMatch: {
                version: first.version,
            },
        });
        await expect(
            store.saveDraft({
                kind: 'page',
                key: '/',
                draft: {
                    heading: 'Stale',
                },
                author: 'ada',
                ifMatch: {
                    version: first.version,
                },
            })
        ).rejects.toBeInstanceOf(VersionConflictError);
        expect((await store.get('page', '/'))?.draft).toEqual({
            heading: 'Two',
        });
        expect(await store.latestVersion(first.document.id)).toBe(2);
    });

    it('folds a save into the recent unpublished version of the same author', async () => {
        const first = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'One',
            },
            author: 'ada',
        });
        const folded = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'One, edited',
            },
            author: 'ada',
            fold: 60_000,
        });
        expect(folded.version).toBe(first.version);
        expect((await store.version(first.document.id, 1))?.data).toEqual({
            heading: 'One, edited',
        });
        const other = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'Grace',
            },
            author: 'grace',
            fold: 60_000,
        });
        expect(other.version).toBe(2);
        await store.publish('page', '/', 'grace');
        const afterPublish = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'After',
            },
            author: 'grace',
            fold: 60_000,
        });
        expect(afterPublish.version).toBe(3);
    });

    it('refuses a write whose save time is behind, even at the same version', async () => {
        const first = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'One',
            },
            author: 'ada',
        });
        const savedAt = first.document.updatedAt.getTime();
        await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'Other tab',
            },
            author: 'ada',
            fold: 60_000,
        });
        await expect(
            store.saveDraft({
                kind: 'page',
                key: '/',
                draft: {
                    heading: 'Stale tab',
                },
                author: 'ada',
                fold: 60_000,
                ifMatch: {
                    version: 1,
                    savedAt,
                },
            })
        ).rejects.toBeInstanceOf(VersionConflictError);
    });

    it('publishes the draft at its version and leaves later drafts unpublished', async () => {
        await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'One',
            },
            author: 'ada',
        });
        const published = await store.publish('page', '/', 'ada');
        expect(published?.published).toEqual({
            heading: 'One',
        });
        expect(published?.publishedVersion).toBe(1);
        await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'Two',
            },
            author: 'ada',
        });
        const row = await store.get('page', '/');
        expect(row?.published).toEqual({
            heading: 'One',
        });
        expect(row?.draft).toEqual({
            heading: 'Two',
        });
    });

    it('does not publish a page without a draft', async () => {
        expect(await store.publish('page', '/missing', 'ada')).toBeUndefined();
    });

    it('rebuilds the refs index on every save and answers where-used', async () => {
        const saved = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                featured: ['prod_1', 'prod_2'],
            },
            author: 'ada',
            refs: [
                {
                    brand: 'ProductId',
                    refId: 'prod_1',
                    fieldPath: 'featured.0',
                },
                {
                    brand: 'ProductId',
                    refId: 'prod_2',
                    fieldPath: 'featured.1',
                },
            ],
        });
        expect(await store.whereUsed('ProductId', 'prod_2')).toMatchObject([
            {
                id: saved.document.id,
                fieldPaths: ['featured.1'],
            },
        ]);
        await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                featured: ['prod_1'],
            },
            author: 'ada',
            refs: [
                {
                    brand: 'ProductId',
                    refId: 'prod_1',
                    fieldPath: 'featured.0',
                },
            ],
        });
        expect(await store.whereUsed('ProductId', 'prod_2')).toEqual([]);
    });

    it('reads one version back with its data', async () => {
        const saved = await store.saveDraft({
            kind: 'page',
            key: '/',
            draft: {
                heading: 'One',
            },
            author: 'ada',
        });
        expect((await store.version(saved.document.id, 1))?.data).toEqual({
            heading: 'One',
        });
        expect(await store.version(saved.document.id, 7)).toBeUndefined();
    });

    it('stores media as published documents of kind media', async () => {
        const media = await store.saveMedia(
            'med_1',
            {
                contentType: 'image/png',
            },
            'ada'
        );
        expect(media.kind).toBe('media');
        expect(media.publishedVersion).toBe(1);
        expect(await store.list('media')).toHaveLength(1);
        expect(await store.list('page')).toHaveLength(0);
    });
});
