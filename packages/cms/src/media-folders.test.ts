import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { expressAdapter } from '@kizunajs/express';
import { definePage } from './page.js';
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import { memoryMediaStorage } from './media/storage.js';
import { croppedImage, ImageSchema } from './image.js';
import { heldJobs } from './held-jobs.fixture.js';
import type { CmsExports } from './setup.js';

const k = new Kizuna();
const roles = Kizuna.roles(['editor', 'admin']);

const EDITORS: Record<string, { userId: string; role: 'editor' | 'admin'; sites?: Record<string, 'editor' | 'admin'> }> = {
    'mia-token': {
        userId: 'mia',
        role: 'admin',
    },
    'nils-token': {
        userId: 'nils',
        role: 'editor',
        sites: {
            norway: 'admin',
        },
    },
};

const editor = k.identity
    .bearer({
        context: z.object({
            userId: z.string(),
            sites: z.record(z.string(), z.enum(['editor', 'admin'])).optional(),
        }),
        roles,
    })
    .guard(({ bearer, deny }) => {
        const found = EDITORS[bearer?.token ?? ''];
        if (found !== undefined) return found;
        return deny({
            status: 401,
            body: {
                detail: 'Unauthorized',
            },
        });
    });

const Articles = defineCollection({
    name: 'articles',
    id: Kizuna.brand('ArticleId', z.string()),
    fields: [
        {
            name: 'title',
            schema: z.string().min(1),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: definePage({
            name: 'frontPage',
            label: 'Front page',
            fields: [
                {
                    name: 'hero',
                    schema: croppedImage({
                        aspectRatio: '16:9',
                    }).optional(),
                },
            ],
        }),
    },
});

const storage = memoryMediaStorage();
const pglite = new PGlite();
const db = drizzle(pglite);
const config = defineConfig({
    jobRunner: heldJobs,
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        locales: ['nb', 'en'],
        sites: declareSites(SiteSchema, {
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
                locales: ['en'],
                pages: countryPages,
            },
            norway: {
                label: 'Hagen Norge',
                url: 'https://hagen.example.no',
                icon: '/icons/norway.svg',
                locales: ['nb', 'en'],
                pages: countryPages,
            },
        }),
        collections: [Articles],
        auth: {
            identity: 'editor',
            roles: ['editor', 'admin'],
            sites: (signedIn) => signedIn.sites,
        },
        media: {
            storage,
        },
    }),
});
const app = express();
config.api.mount(app);
const service = () => (pluginExportsOf(config.api)['cms'] as CmsExports).service;

const as = (token: string) => ({
    get: (path: string) => request(app).get(path).set('authorization', `Bearer ${token}`),
    post: (path: string) => request(app).post(path).set('authorization', `Bearer ${token}`),
    patch: (path: string) => request(app).patch(path).set('authorization', `Bearer ${token}`),
    delete: (path: string) => request(app).delete(path).set('authorization', `Bearer ${token}`),
});
const mia = as('mia-token');
const nils = as('nils-token');

const png = async (shade: number, width = 32, height = 18): Promise<Uint8Array> =>
    new Uint8Array(
        await sharp({
            create: {
                width,
                height,
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

const library = (site?: string): Record<string, string> =>
    site === undefined
        ? {}
        : {
              site,
          };

const upload = async (bytes: Uint8Array, site?: string, folder?: string): Promise<{ id: string; site?: string; folder?: string }> => {
    const created = await mia.post('/editing/media/uploads').query(library(site)).send({
        filename: 'skog-stammer.png',
        contentType: 'image/png',
        size: bytes.byteLength,
    });
    expect(created.status).toBe(201);
    await storage.put(`uploads/${created.body.uploadId}`, bytes, 'image/png');
    const completed = await mia
        .post(`/editing/media/uploads/${created.body.uploadId}`)
        .query(library(site))
        .send(
            folder === undefined
                ? {}
                : {
                      folder,
                  }
        );
    expect(completed.status).toBe(201);
    return completed.body;
};

const folderIn = async (name: string, site?: string, parent?: string): Promise<{ id: string }> => {
    const made = await mia
        .post('/editing/media/folders')
        .query(library(site))
        .send({
            name,
            ...(parent === undefined
                ? {}
                : {
                      parent,
                  }),
        });
    expect(made.status).toBe(201);
    return made.body;
};

const setHero = (site: string, hero: unknown, locale?: string) =>
    mia
        .patch(`/editing/sites/${site}/pages/frontPage/draft`)
        .query(
            locale === undefined
                ? {}
                : {
                      locale,
                  }
        )
        .send({
            changes: {
                hero,
            },
        });

const publishHero = (site: string) => mia.post(`/editing/sites/${site}/pages/frontPage/publish`).send({});

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('media folders', () => {
    it("keeps each library's folders apart, nested, and counts what each holds", async () => {
        const kampanjer = await folderIn('Kampanjer', 'norway');
        const jul = await folderIn('Jul 2026', 'norway', kampanjer.id);
        await folderIn('Ansatte');
        await upload(await png(10), 'norway', jul.id);
        const norway = await mia.get('/editing/media').query(library('norway'));
        expect(norway.body.folders).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'Jul 2026',
                    parent: kampanjer.id,
                    site: 'norway',
                    images: 1,
                }),
                expect.objectContaining({
                    name: 'Ansatte',
                    images: 0,
                }),
            ])
        );
        expect(norway.body.media[0].folder).toBe(jul.id);
        const uk = await mia.get('/editing/media').query(library('uk'));
        expect(uk.body.folders.map((folder: { name: string }) => folder.name)).toEqual(['Ansatte']);
    });

    it('refuses a name taken beside it, a folder moved into itself, and deleting one that holds something', async () => {
        const kampanjer = await folderIn('Kampanjer', 'norway');
        const jul = await folderIn('Jul 2026', 'norway', kampanjer.id);
        const taken = await mia.post('/editing/media/folders').query(library('norway')).send({
            name: 'kampanjer',
        });
        expect(taken.status).toBe(409);
        expect(
            (
                await mia.patch(`/editing/media/folders/${kampanjer.id}`).send({
                    parent: jul.id,
                })
            ).status
        ).toBe(409);
        expect((await mia.delete(`/editing/media/folders/${kampanjer.id}`)).status).toBe(409);
        const renamed = await mia.patch(`/editing/media/folders/${jul.id}`).send({
            name: 'Jul 2027',
            parent: null,
        });
        expect(renamed.status).toBe(200);
        expect(renamed.body).toEqual(
            expect.objectContaining({
                name: 'Jul 2027',
            })
        );
        expect(renamed.body.parent).toBeUndefined();
        expect((await mia.delete(`/editing/media/folders/${kampanjer.id}`)).status).toBe(204);
    });

    it("keeps the shared library's folders to an admin over every site", async () => {
        const refused = await nils.post('/editing/media/folders').send({
            name: 'Natur',
        });
        expect(refused.status).toBe(403);
        expect(
            (
                await nils.post('/editing/media/folders').query(library('norway')).send({
                    name: 'Butikkene',
                })
            ).status
        ).toBe(201);
    });
});

describe('moving images', () => {
    it('moves images into a folder and back to the top level', async () => {
        const butikkene = await folderIn('Butikkene', 'norway');
        const image = await upload(await png(20), 'norway');
        const moved = await mia.post('/editing/media/move').send({
            ids: [image.id],
            site: 'norway',
            folder: butikkene.id,
        });
        expect(moved.status).toBe(200);
        expect(moved.body.media[0].folder).toBe(butikkene.id);
        const back = await mia.post('/editing/media/move').send({
            ids: [image.id],
            site: 'norway',
        });
        expect(back.body.media[0].folder).toBeUndefined();
    });

    it('moves a site image into Shared keeping its id, so the page holding it still shows it', async () => {
        const image = await upload(await png(30), 'norway');
        expect((await setHero('norway', { id: image.id, alt: '' })).status).toBe(200);
        expect(
            (
                await nils.post('/editing/media/move').send({
                    ids: [image.id],
                })
            ).status
        ).toBe(403);
        const moved = await mia.post('/editing/media/move').send({
            ids: [image.id],
        });
        expect(moved.status).toBe(200);
        expect(moved.body.media[0].id).toBe(image.id);
        expect(moved.body.media[0].site).toBeUndefined();
        expect((await mia.get(`/content/media/${image.id}/image`)).status).toBe(200);
        expect((await mia.get('/editing/media').query(library('uk'))).body.media.map((record: { id: string }) => record.id)).toContain(
            image.id
        );
    });

    it('refuses to move a shared image into a site while content outside it holds it, and moves nothing', async () => {
        const image = await upload(await png(40));
        await setHero('uk', {
            id: image.id,
            alt: '',
        });
        await setHero('norway', {
            id: image.id,
            alt: '',
        });
        const refused = await mia.post('/editing/media/move').send({
            ids: [image.id],
            site: 'norway',
        });
        expect(refused.status).toBe(409);
        expect(refused.body.detail).toBe('skog-stammer.png is used outside Hagen Norge.');
        expect(refused.body.uses).toEqual([
            expect.objectContaining({
                ref: 'page:uk:frontPage',
                site: 'uk',
            }),
        ]);
        expect((await mia.get(`/editing/media/${image.id}`)).body.site).toBeUndefined();
        await setHero('uk', null);
        expect(
            (
                await mia.post('/editing/media/move').send({
                    ids: [image.id],
                    site: 'norway',
                })
            ).status
        ).toBe(200);
    });

    it('finds a moved image by its bytes, so uploading its file to its new library again adds nothing', async () => {
        const bytes = await png(50);
        const image = await upload(bytes, 'norway');
        await mia.post('/editing/media/move').send({
            ids: [image.id],
        });
        expect((await upload(bytes)).id).toBe(image.id);
        const again = await upload(bytes, 'norway');
        expect(again.id).not.toBe(image.id);
        expect(again.site).toBe('norway');
        expect((await mia.delete(`/editing/media/${again.id}`).query(library('norway'))).status).toBe(204);
        expect((await mia.get(`/content/media/${image.id}/image`)).status).toBe(200);
    });
});

describe('where an image is used', () => {
    it('names the site and languages of each document, and whether only a draft holds it', async () => {
        const image = await upload(await png(60));
        await setHero('norway', {
            id: image.id,
            alt: '',
        });
        await publishHero('norway');
        await mia.post('/editing/collections/articles/items').send({
            values: {
                title: 'Winter care for houseplants',
                image: {
                    id: image.id,
                    alt: '',
                },
            },
        });
        const answer = await mia.get(`/editing/media/${image.id}/uses`);
        expect(answer.status).toBe(200);
        expect(answer.body.elsewhere).toBe(0);
        expect(answer.body.uses).toEqual(
            expect.arrayContaining([
                {
                    ref: 'page:norway:frontPage',
                    site: 'norway',
                    label: 'Front page',
                    locales: ['nb', 'en'],
                    fieldPaths: ['hero'],
                    published: true,
                },
                expect.objectContaining({
                    label: 'Winter care for houseplants',
                    locales: ['nb', 'en'],
                    fieldPaths: ['image'],
                    published: false,
                }),
            ])
        );
        expect((await mia.get('/editing/media')).body.media[0].uses).toBe(2);
    });

    it('counts the documents in sites the editor does not edit', async () => {
        const image = await upload(await png(70));
        await setHero('uk', {
            id: image.id,
            alt: '',
        });
        await setHero('norway', {
            id: image.id,
            alt: '',
        });
        const answer = await nils.get(`/editing/media/${image.id}/uses`);
        expect(answer.body.uses.map((use: { ref: string }) => use.ref)).toEqual(['page:norway:frontPage']);
        expect(answer.body.elsewhere).toBe(1);
    });

    it('rebuilds the index from the content', async () => {
        const image = await upload(await png(80));
        await setHero('uk', {
            id: image.id,
            alt: '',
        });
        await pglite.exec('delete from cms_refs;');
        expect((await mia.get(`/editing/media/${image.id}/uses`)).body.uses).toEqual([]);
        await service().reindexRefs();
        expect((await mia.get(`/editing/media/${image.id}/uses`)).body.uses).toHaveLength(1);
    });
});

describe('deleting an image', () => {
    it('is refused while a draft or the published content holds it, listing what does', async () => {
        const image = await upload(await png(90));
        await setHero('uk', {
            id: image.id,
            alt: '',
        });
        await publishHero('uk');
        const refused = await mia.delete(`/editing/media/${image.id}`);
        expect(refused.status).toBe(409);
        expect(refused.body.detail).toBe('skog-stammer.png is used in 1 place. Remove it from each before deleting it.');
        expect(refused.body.uses[0]).toEqual(
            expect.objectContaining({
                ref: 'page:uk:frontPage',
            })
        );
        await setHero('uk', null);
        expect((await mia.delete(`/editing/media/${image.id}`)).status).toBe(409);
        await publishHero('uk');
        expect((await mia.delete(`/editing/media/${image.id}`)).status).toBe(204);
    });

    it('leaves the field empty when a version that held it is restored', async () => {
        const image = await upload(await png(100));
        const saved = await setHero('uk', {
            id: image.id,
            alt: '',
        });
        await setHero('uk', null);
        await publishHero('uk');
        expect((await mia.delete(`/editing/media/${image.id}`)).status).toBe(204);
        const restored = await mia.post('/editing/sites/uk/pages/frontPage/rollback').send({
            version: saved.body.version,
        });
        expect(restored.status).toBe(200);
        expect(restored.body.content).not.toHaveProperty('hero');
    });
});

describe('a cropped image', () => {
    it('reads at its shape: the largest 16:9 part around the focal point until one is set, and the crop set once it is', async () => {
        const image = await upload(await png(110, 100, 100));
        await setHero('uk', {
            id: image.id,
            alt: '',
            focalPoint: {
                x: 0.5,
                y: 0,
            },
        });
        await publishHero('uk');
        const unset = await request(app).get('/content/sites/uk/pages/frontPage');
        expect(unset.status).toBe(200);
        expect(unset.body.content.hero).toEqual(
            expect.objectContaining({
                width: 100,
                height: 56,
            })
        );
        expect(unset.body.content.hero.url).toContain('crop=0,0,1,0.5625');
        await setHero('uk', {
            id: image.id,
            alt: '',
            crop: {
                x: 0,
                y: 0.4,
                width: 1,
                height: 0.5625,
            },
        });
        await publishHero('uk');
        const set = await request(app).get('/content/sites/uk/pages/frontPage');
        expect(set.body.content.hero.url).toContain('crop=0,0.4,1,0.5625');
    });

    it('reads a crop of another shape as unset', async () => {
        const image = await upload(await png(120, 100, 100));
        await setHero('uk', {
            id: image.id,
            alt: '',
            crop: {
                x: 0,
                y: 0,
                width: 1,
                height: 1,
            },
        });
        await publishHero('uk');
        const read = await request(app).get('/content/sites/uk/pages/frontPage');
        expect(read.body.content.hero.height).toBe(56);
        expect(read.body.content.hero.url).toContain('crop=0,0.2188,1,0.5625');
    });
});
