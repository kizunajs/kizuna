import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineGlobal } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { memoryMediaStorage } from './media/storage.js';
import { ImageSchema } from './image.js';

const k = new Kizuna();
const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
        }),
    })
    .guard(() => ({
        userId: 'ada',
    }));

const Footer = defineGlobal({
    name: 'footer',
    fields: [
        {
            name: 'logo',
            schema: ImageSchema.optional(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: definePage({
            name: 'frontPage',
            fields: [
                {
                    name: 'hero',
                    schema: ImageSchema.optional(),
                },
            ],
        }),
    },
});

const storage = memoryMediaStorage();
const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        sites: declareSites(SiteSchema, {
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
                pages: countryPages,
            },
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: '/icons/norway.svg',
                pages: countryPages,
            },
        }),
        globals: [Footer],
        auth: {
            identity: 'editor',
        },
        media: {
            storage,
        },
    }),
});
const app = express();
config.api.mount(app);

const png = async (shade: number): Promise<Uint8Array> =>
    new Uint8Array(
        await sharp({
            create: {
                width: 2,
                height: 3,
                channels: 3,
                background: {
                    r: shade,
                    g: shade,
                    b: shade,
                },
            },
        })
            .png()
            .toBuffer()
    );

const upload = async (bytes: Uint8Array, site?: string): Promise<{ id: string; site?: string }> => {
    const query = library(site);
    const created = await request(app).post('/editing/media/uploads').query(query).send({
        filename: 'photo.png',
        contentType: 'image/png',
        size: bytes.byteLength,
    });
    expect(created.status).toBe(201);
    await storage.put(`uploads/${created.body.uploadId}`, bytes, 'image/png');
    const completed = await request(app).post(`/editing/media/uploads/${created.body.uploadId}`).query(query);
    expect(completed.status).toBe(201);
    return completed.body;
};

const image = (id: string) => ({
    id,
});

/**
 * The query naming a site's library, or the shared one.
 */
const library = (site?: string): Record<string, string> =>
    site === undefined
        ? {}
        : {
              site,
          };

const alt = {
    alt: 'A shop front',
};

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('media per site', () => {
    it("keeps an upload from a site's library on that site, and lists it there beside the shared images", async () => {
        const shared = await upload(await png(10));
        const uk = await upload(await png(20), 'uk');
        expect(shared.site).toBeUndefined();
        expect(uk.site).toBe('uk');
        const ids = async (site?: string) =>
            (await request(app).get('/editing/media').query(library(site))).body.media.map((record: { id: string; site?: string }) => [
                record.id,
                record.site ?? 'shared',
            ]);
        expect(await ids()).toEqual([[shared.id, 'shared']]);
        expect(await ids('uk')).toEqual(
            expect.arrayContaining([
                [shared.id, 'shared'],
                [uk.id, 'uk'],
            ])
        );
        expect(await ids('norway')).toEqual([[shared.id, 'shared']]);
        expect((await request(app).get(`/content/media/${uk.id}/image`)).status).toBe(200);
    });

    it('keeps the same file on a site apart from the shared one', async () => {
        const bytes = await png(30);
        const shared = await upload(bytes);
        const uk = await upload(bytes, 'uk');
        expect(uk.id).not.toBe(shared.id);
        expect((await request(app).delete(`/editing/media/${uk.id}`).query(library('uk'))).status).toBe(204);
        expect((await request(app).get(`/content/media/${shared.id}/image`)).status).toBe(200);
    });

    it('changes and deletes an image only from its own library', async () => {
        const uk = await upload(await png(40), 'uk');
        const shared = await upload(await png(50));
        expect((await request(app).patch(`/editing/media/${uk.id}`).send(alt)).status).toBe(403);
        expect((await request(app).patch(`/editing/media/${uk.id}`).query(library('norway')).send(alt)).status).toBe(403);
        expect((await request(app).patch(`/editing/media/${uk.id}`).query(library('uk')).send(alt)).status).toBe(200);
        expect((await request(app).delete(`/editing/media/${shared.id}`).query(library('uk'))).status).toBe(403);
        expect((await request(app).delete(`/editing/media/${shared.id}`)).status).toBe(204);
    });

    it("lets shared content hold only shared images, and a site's content its own beside them", async () => {
        const shared = await upload(await png(60));
        const uk = await upload(await png(70), 'uk');
        const footer = await request(app)
            .patch('/editing/globals/footer/draft')
            .send({
                changes: {
                    logo: image(uk.id),
                },
            });
        expect(footer.status).toBe(422);
        expect(footer.body.detail).toContain('belongs to the uk site, so shared content cannot hold it');
        expect(
            (
                await request(app)
                    .patch('/editing/globals/footer/draft')
                    .send({
                        changes: {
                            logo: image(shared.id),
                        },
                    })
            ).status
        ).toBe(200);
        expect(
            (
                await request(app)
                    .patch('/editing/sites/uk/pages/frontPage/draft')
                    .send({
                        changes: {
                            hero: image(uk.id),
                        },
                    })
            ).status
        ).toBe(200);
        const norway = await request(app)
            .patch('/editing/sites/norway/pages/frontPage/draft')
            .send({
                changes: {
                    hero: image(uk.id),
                },
            });
        expect(norway.status).toBe(422);
        expect(norway.body.detail).toContain("Use one of the norway site's images, or a shared one.");
    });

    it('refuses a site no declareSites() names', async () => {
        expect((await request(app).get('/editing/media').query(library('denmark'))).status).toBe(404);
    });
});
