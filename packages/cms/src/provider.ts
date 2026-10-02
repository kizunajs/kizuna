import { defineContentProvider, type ContentDocument, type ContentProvider } from 'kizunajs/plugin';
import { pluginExportsOf } from 'kizunajs/adapter';
import { cmsPluginDeclaration, type CmsExports } from './plugin.js';
import { cmsRoutes, type CmsRoutes } from './routes.js';
import { createReader, type CmsContent } from './reader.js';
import { DEFAULT_SITE, sitesOf, type CmsPluginOptions, type PageMap, type SiteOptions } from './options.js';
import type { Collection, Global } from './definitions.js';
import { servesCollection } from './page.js';
import { latestMigration } from './content.js';

/**
 * Every page, global and collection, for the snapshot and `kizuna diff`.
 */
const documentsOf = (options: CmsPluginOptions): ContentDocument[] => [
    ...Object.entries(sitesOf(options)).flatMap(([site, declared]) =>
        Object.entries(declared.pages)
            .filter(([, entry]) => !servesCollection(entry.page))
            .map(
                ([name, entry]): ContentDocument => ({
                    ref: site === DEFAULT_SITE ? `page:${name}` : `page:${site}:${name}`,
                    kind: 'page',
                    name,
                    schema: entry.page.schema,
                    migration: latestMigration(entry.page),
                })
            )
    ),
    ...(options.globals ?? []).map(
        (definition): ContentDocument => ({
            ref: `global:${definition.name}`,
            kind: 'global',
            name: definition.name,
            schema: definition.schema,
            migration: latestMigration(definition),
        })
    ),
    ...(options.collections ?? []).map(
        (definition): ContentDocument => ({
            ref: `collection:${definition.name}`,
            kind: 'collection',
            name: definition.name,
            schema: definition.schema,
            migration: latestMigration(definition),
        })
    ),
];

/**
 * Content editors change on the page, stored in your own database: pages
 * declared in a `content.ts` beside their route, globals and collections.
 * Hand it to `content` on `defineConfig`, and read it with `kizuna.content`.
 *
 * @example
 * export default defineConfig({
 *     adapter: nextAdapter(),
 *     auth: {
 *         identities: {
 *             editor,
 *         },
 *     },
 *     content: cms({
 *         db,
 *         pages,
 *         auth: {
 *             identity: 'editor',
 *         },
 *     }),
 * });
 */
export function cms<
    const Pages extends PageMap = PageMap,
    const Globals extends readonly Global[] = readonly [],
    const Collections extends readonly Collection[] = readonly [],
    const Sites extends Record<string, SiteOptions> = {},
>(
    options: CmsPluginOptions<Pages, Sites> & {
        globals?: Globals;
        collections?: Collections;
    }
): ContentProvider<CmsContent<Pages, Globals, Collections, Sites>, CmsRoutes>;
export function cms(options: CmsPluginOptions): ContentProvider<unknown, CmsRoutes> {
    const plugin = cmsPluginDeclaration(options);
    return defineContentProvider({
        plugin,
        routes: cmsRoutes(plugin),
        reader: ({ api, runtime }) => createReader((pluginExportsOf(api)[plugin.slug] as CmsExports).service, runtime),
        documents: () => documentsOf(options),
    });
}
