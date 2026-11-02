import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { pluginExportsOf } from 'kizunajs/adapter';
import { definePage } from './page.js';
import { defineCollection } from './definitions.js';
import { cms } from './provider.js';
import { definePages } from './options.js';
import { declareSites, SiteSchema } from './site.js';
import { DocumentStore } from './storage/store.js';
import type { DocumentRef } from './refs.js';
import type { CmsExports } from './setup.js';
import { run } from './cli.js';
import { heldJobs } from './held-jobs.fixture.js';

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

const ShopId = Kizuna.brand('ShopId', z.string());

const Shops = defineCollection({
    name: 'shops',
    id: ShopId,
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'slug',
            schema: z.string(),
        },
    ],
});

const pageNamed = (name: string) =>
    definePage({
        name,
        fields: [
            {
                name: 'heading',
                schema: z.string(),
            },
        ],
    });

const ShopPage = definePage({
    name: 'shopPage',
    collection: Shops,
});

const pglite = new PGlite();
const db = drizzle(pglite);

/**
 * Hagen Norge's config, with its contact page and shops where `paths` puts
 * them, so two configs on one database stand for a deploy that moved them.
 */
const configWith = (paths: { contact: `/${string}`; shop: `/${string}`; pricesPage?: `/${string}` }) =>
    defineConfig({
        jobRunner: heldJobs,
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            locales: ['nb', 'en'],
            sites: declareSites(SiteSchema, {
                norway: {
                    label: 'Hagen Norge',
                    url: 'https://hagen.example.no',
                    icon: '/icons/norway.svg',
                    locales: ['nb', 'en'],
                    pages: definePages({
                        frontPage: {
                            path: '/',
                            page: pageNamed('frontPage'),
                        },
                        contactPage: {
                            path: paths.contact,
                            page: pageNamed('contactPage'),
                        },
                        shopPage: {
                            path: paths.shop,
                            page: ShopPage,
                        },
                        ...(paths.pricesPage === undefined
                            ? {}
                            : {
                                  pricesPage: {
                                      path: paths.pricesPage,
                                      page: pageNamed('pricesPage'),
                                  },
                              }),
                    }),
                },
            }),
            collections: [Shops],
            auth: {
                identity: 'editor',
            },
        }),
    });

const before = configWith({
    contact: '/kontakt',
    shop: '/butikker/[slug]',
});
const serviceOf = (config: ReturnType<typeof configWith>) => (pluginExportsOf(config.api)['cms'] as CmsExports).service;
const service = serviceOf(before);

const cliRun = async (argv: string[], config = before): Promise<{ code: number; output: string }> => {
    const lines: string[] = [];
    const code = await run(argv, {
        cwd: process.cwd(),
        configPath: 'kizuna.config.ts',
        loadApi: async () => config.api,
        stdout: (line) => lines.push(line),
        stderr: (line) => lines.push(line),
    });
    return {
        code,
        output: lines.join('\n'),
    };
};

const contactPage = (locale?: string): DocumentRef => ({
    type: 'page',
    name: 'contactPage',
    site: 'norway',
    ...(locale === undefined
        ? {}
        : {
              locale,
          }),
});

const shop = (id: string): DocumentRef => ({
    type: 'item',
    collection: 'shops',
    id,
});

const publish = async (ref: DocumentRef, changes: Record<string, unknown>, on = service): Promise<void> => {
    await on.update({
        ref,
        changes,
        caller: {},
        author: 'ada',
    });
    await on.publish(ref, 'ada');
};

const redirects = async () =>
    (await service.redirects.list('norway')).map((redirect) => ({
        locale: redirect.locale,
        from: redirect.from,
        to: redirect.to,
        status: redirect.status,
        origin: redirect.origin,
    }));

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec(
        'delete from cms_redirects; delete from cms_redirect_versions; delete from cms_refs; delete from cms_versions; delete from cms_translations; delete from cms_documents;'
    );
});

afterAll(async () => {
    await pglite.close();
});

describe('kizuna cms check, for pages moved in code', () => {
    const moved = configWith({
        contact: '/om-oss/kontakt',
        shop: '/butikk/[slug]',
    });

    const published = async (): Promise<void> => {
        await publish(contactPage(), {
            heading: 'Kontakt oss',
        });
        await publish(contactPage('en'), {
            heading: 'Contact us',
        });
        await publish(shop('oslo'), {
            name: 'Oslo',
            slug: 'oslo',
        });
    };

    it('prints what it did before when nothing moved', async () => {
        await published();
        expect(await cliRun(['check'])).toEqual({
            code: 0,
            output: 'All published content passes its schema.',
        });
    });

    it('lists each address a page or an item left, per language', async () => {
        await published();
        const checked = await cliRun(['check', '--json'], moved);
        expect(checked.code).toBe(0);
        expect(JSON.parse(checked.output)).toEqual({
            problems: [],
            redirected: false,
            moved: expect.arrayContaining([
                {
                    ref: 'page:norway:contactPage',
                    site: 'norway',
                    locale: 'nb',
                    from: '/kontakt',
                    to: '/om-oss/kontakt',
                },
                {
                    ref: 'page:norway:contactPage',
                    site: 'norway',
                    locale: 'en',
                    from: '/en/kontakt',
                    to: '/en/om-oss/kontakt',
                },
                {
                    ref: 'item:shops:oslo',
                    site: 'norway',
                    locale: 'nb',
                    from: '/butikker/oslo',
                    to: '/butikk/oslo',
                },
            ]),
        });
        expect((await cliRun(['check'], moved)).output).toContain('/kontakt is now /om-oss/kontakt');
        expect(await redirects()).toEqual([]);
    });

    it('redirects them with --redirect, once', async () => {
        await published();
        const checked = await cliRun(['check', '--redirect'], moved);
        expect(checked.code).toBe(0);
        expect(checked.output).toContain('Redirected the old addresses of pages that moved in code:');
        expect(await redirects()).toEqual(
            expect.arrayContaining([
                {
                    locale: 'nb',
                    from: '/kontakt',
                    to: {
                        type: 'document',
                        ref: 'page:norway:contactPage',
                    },
                    status: 308,
                    origin: 'rename',
                },
                {
                    locale: 'nb',
                    from: '/butikker/oslo',
                    to: {
                        type: 'document',
                        ref: 'item:shops:oslo',
                    },
                    status: 308,
                    origin: 'rename',
                },
            ])
        );
        const [kontakt] = (await service.redirects.list('norway')).filter((redirect) => redirect.from === '/kontakt');
        await service.redirects.deleteEdit('norway', kontakt!.id);
        expect(JSON.parse((await cliRun(['check', '--json'], moved)).output).moved).toEqual([]);
    });

    it('leaves out an old address another page is published at now', async () => {
        await published();
        const taken = configWith({
            contact: '/om-oss/kontakt',
            shop: '/butikker/[slug]',
            pricesPage: '/kontakt',
        });
        await publish(
            {
                type: 'page',
                name: 'pricesPage',
                site: 'norway',
            },
            {
                heading: 'Priser',
            },
            serviceOf(taken)
        );
        const moves = JSON.parse((await cliRun(['check', '--json'], taken)).output).moved;
        expect(moves.map((move: { from: string }) => move.from)).toEqual(['/en/kontakt']);
    });
});

describe('kizuna cms import-redirects', () => {
    const folder = mkdtempSync(join(tmpdir(), 'kizuna-redirects-'));
    const csv = (name: string, text: string): string => {
        const file = join(folder, name);
        writeFileSync(file, text);
        return file;
    };

    it('writes each row as a 308, or its 307, made by the import', async () => {
        const file = csv(
            'rows.csv',
            'from,to,status\n/produkt.php?id=12,/butikker/oslo,\n/sommer/,/kampanje/sommer,307\n/en/old-about,https://example.com/about,301\n'
        );
        const imported = await cliRun(['import-redirects', file, '--site', 'norway']);
        expect(imported).toEqual({
            code: 0,
            output: 'Wrote 3 redirects, collapsed 0, skipped 0.',
        });
        expect(await redirects()).toEqual([
            {
                locale: 'en',
                from: '/en/old-about',
                to: {
                    type: 'url',
                    url: 'https://example.com/about',
                },
                status: 308,
                origin: 'import',
            },
            {
                locale: 'nb',
                from: '/produkt.php?id=12',
                to: {
                    type: 'path',
                    path: '/butikker/oslo',
                },
                status: 308,
                origin: 'import',
            },
            {
                locale: 'nb',
                from: '/sommer',
                to: {
                    type: 'path',
                    path: '/kampanje/sommer',
                },
                status: 307,
                origin: 'import',
            },
        ]);
        expect(await service.redirects.version('norway')).toBe(1);
    });

    it('skips a live address and one that redirects already, and says why', async () => {
        await publish(contactPage(), {
            heading: 'Kontakt oss',
        });
        await service.redirects.saveEdit(
            {
                site: 'norway',
                locale: 'nb',
                from: '/om',
                to: {
                    type: 'path',
                    path: '/om-oss',
                },
                status: 308,
                createdBy: 'ada',
            },
            []
        );
        const file = csv('skips.csv', 'from,to\n/kontakt,/kontakt-oss\n/om,/about\n/gammel,/ny\n/gammel,/nyere\nbutikk,/butikker\n');
        const imported = await cliRun(['import-redirects', file, '--site', 'norway', '--json']);
        expect(imported.code).toBe(0);
        const result = JSON.parse(imported.output);
        expect(result.written.map((row: { from: string }) => row.from)).toEqual(['/gammel']);
        expect(result.skipped.map((row: { line: number; reason: string }) => [row.line, row.reason])).toEqual([
            [2, 'live'],
            [3, 'redirects'],
            [5, 'duplicate'],
            [6, 'invalid'],
        ]);
        expect(result.skipped[0].detail).toContain('is published there');
        expect(result.skipped[1].detail).toBe('it redirects to /om-oss already.');
    });

    it('collapses a row that points at another row, or at a stored redirect, and repoints one that led to it', async () => {
        await service.redirects.saveEdit(
            {
                site: 'norway',
                locale: 'nb',
                from: '/kampanje',
                to: {
                    type: 'path',
                    path: '/gammel-butikk',
                },
                status: 307,
                createdBy: 'ada',
            },
            []
        );
        await service.redirects.saveEdit(
            {
                site: 'norway',
                locale: 'nb',
                from: '/om',
                to: {
                    type: 'path',
                    path: '/om-oss',
                },
                status: 308,
                createdBy: 'ada',
            },
            []
        );
        const file = csv('chains.csv', 'from,to\n/a,/b\n/b,/c\n/gammel-butikk,/butikker/oslo\n/info,/om\n');
        const imported = await cliRun(['import-redirects', file, '--site', 'norway']);
        expect(imported.output).toBe(
            [
                'Wrote 4 redirects, collapsed 2, skipped 0.',
                'Collapsed, since their to redirects too:',
                '  line 2: /a goes to /c rather than /b',
                '  line 5: /info goes to /om-oss rather than /om',
            ].join('\n')
        );
        const stored = new Map((await redirects()).map((redirect) => [redirect.from, redirect.to]));
        expect(stored.get('/a')).toEqual({
            type: 'path',
            path: '/c',
        });
        expect(stored.get('/kampanje')).toEqual({
            type: 'path',
            path: '/butikker/oslo',
        });
        expect(stored.get('/info')).toEqual({
            type: 'path',
            path: '/om-oss',
        });
    });

    it('writes nothing with --dry-run', async () => {
        const file = csv('dry.csv', 'from,to\n/a,/b\n');
        expect((await cliRun(['import-redirects', file, '--site', 'norway', '--dry-run'])).output).toBe(
            'Would write 1 redirect, collapsed 0, skipped 0.'
        );
        expect(await redirects()).toEqual([]);
    });

    it('asks for the site, and refuses a file without from and to', async () => {
        const file = csv('site.csv', 'from,to\n/a,/b\n');
        expect(await cliRun(['import-redirects', file])).toEqual({
            code: 1,
            output: 'Pass --site <name>. Known: norway.',
        });
        const headless = csv('headless.csv', '/a,/b\n');
        const refused = await cliRun(['import-redirects', headless, '--site', 'norway']);
        expect(refused.code).toBe(1);
        expect(refused.output).toContain('needs from and to');
    });
});
