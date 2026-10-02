import { z } from 'zod';
import { definePlugin, type PluginDeclaration, type PluginApi } from 'kizunajs/plugin';
import { defineGenerator, readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { CmsService } from './cms.js';
import { brandOf } from './cms.js';
import { routeProblems } from './dynamic.js';
import {
    CmsPluginOptionsSchema,
    DEFAULT_SITE,
    sitesOf,
    type CmsPluginOptions,
    type PageMap,
    type ResolvedCmsOptions,
    type SiteOptions,
} from './options.js';
import type { Collection, ContentDefinition, Global } from './definitions.js';
import { describeFields, type DescribedField } from './content.js';
import { defaultPagesOutput, discoverPages, findAppDir, renderPagesModule } from './discovery.js';
import { resolve } from 'node:path';

/**
 * What handlers reach at `plugins.cms`.
 */
export interface CmsExports<
    Pages extends PageMap = PageMap,
    Globals extends readonly Global[] = readonly Global[],
    Collections extends readonly Collection[] = readonly Collection[],
    Sites extends Record<string, SiteOptions> = Record<string, SiteOptions>,
> {
    /**
     * The pages, as the generated module declared them.
     */
    pages: Pages;
    /**
     * Every site's pages, when several apps share the CMS.
     */
    sites: Sites;
    /**
     * The globals the plugin was given.
     */
    globals: Globals;
    /**
     * The collections the plugin was given.
     */
    collections: Collections;
    /**
     * Drop the cached renders of every page holding this id. Call it from the
     * route or webhook that changed the item.
     *
     * @example
     * await plugins.cms.invalidate(ProductId, body.id);
     */
    invalidate: (brand: string | z.core.$ZodType, id: string) => Promise<string[]>;
    /**
     * A short-lived token that opens draft mode.
     */
    previewToken: () => string;
    /**
     * Everything the routes and the Next reader share.
     */
    service: CmsService;
}

export interface CmsSetup<
    Pages extends PageMap = PageMap,
    Globals extends readonly Global[] = readonly Global[],
    Collections extends readonly Collection[] = readonly Collection[],
    Sites extends Record<string, SiteOptions> = Record<string, SiteOptions>,
> {
    exports: CmsExports<Pages, Globals, Collections, Sites>;
}

const pagesGenerator = defineGenerator({
    options: z.object({
        appDir: z.string(),
    }),
    generate: ({ options }) => ({
        finalize: () => {
            const appDir = resolve(/* turbopackIgnore: true */ process.cwd(), options.appDir);
            return renderPagesModule(discoverPages(appDir), resolve(/* turbopackIgnore: true */ process.cwd(), defaultPagesOutput(appDir)));
        },
    }),
});

/**
 * The schema that carries a brand, under any `.optional()` or array around it.
 */
const brandedSchemaOf = (schema: z.core.$ZodType): z.core.$ZodType | undefined => {
    if (readMetaBrand(schema) !== undefined) return schema;
    const inner = unwrapOptionalWrappers(schema).inner;
    if (readMetaBrand(inner) !== undefined) return inner;
    const def = readDef(inner);
    return def.type === 'array' && def.element !== undefined ? brandedSchemaOf(def.element) : undefined;
};

/**
 * What two schemas carrying one brand have to agree on, leaving out the
 * description a field may add.
 */
const brandShape = (schema: z.core.$ZodType): string =>
    JSON.stringify(
        z.toJSONSchema(schema as z.ZodType, {
            unrepresentable: 'any',
            io: 'input',
        })
    ).replace(/"description":"[^"]*",?/g, '');

const allFields = (fields: readonly DescribedField[]): DescribedField[] =>
    fields.flatMap((field) => [field, ...allFields(field.fields ?? [])]);

/**
 * Checks that cannot run before the api assembles: field roles against the
 * identity's, brand names against one another, and search routes against
 * the routes the app serves.
 */
const validate = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi): void => {
    const identityRoles = service.identityRoles();
    const declared = identityRoles?.names ?? [];
    const label = `cmsPlugin's identity '${options.auth.identity}'`;
    if (service.roles !== undefined) {
        if (identityRoles === undefined) throw new Error(`cmsPlugin names roles, but ${label} declares none.`);
        for (const role of service.roles) {
            if (!declared.includes(role)) throw new Error(`cmsPlugin accepts the role '${role}', which ${label} does not declare.`);
        }
    }
    const brandSchemas = new Map<string, string>();
    const definitions: Array<[string, ContentDefinition]> = [
        ...Object.entries(sitesOf(options)).flatMap(([site, declared]) =>
            Object.entries(declared.pages).map(([name, entry]): [string, ContentDefinition] => [
                site === DEFAULT_SITE ? `Page '${name}'` : `Page '${name}' of the ${site} site`,
                entry.page,
            ])
        ),
        ...(options.globals ?? []).map((definition): [string, ContentDefinition] => [`Global '${definition.name}'`, definition]),
        ...(options.collections ?? []).map((definition): [string, ContentDefinition] => [`Collection '${definition.name}'`, definition]),
    ];
    const names = new Map<string, string>();
    for (const definition of [...(options.globals ?? []), ...(options.collections ?? [])]) {
        if (names.has(definition.name)) {
            throw new Error(`Two globals or collections are named '${definition.name}'. Give one of them another name.`);
        }
        names.set(definition.name, definition.name);
    }
    const allPages = Object.values(sitesOf(options)).flatMap((declared) => Object.values(declared.pages));
    const problems = allPages.flatMap((entry) => routeProblems(entry.path, entry.page));
    if (problems.length > 0) throw new Error(problems.join('\n'));
    const owners = new Map<string, string>();
    for (const definition of options.collections ?? []) {
        const brand = brandOf(definition.id);
        if (brand === undefined) continue;
        const other = owners.get(brand);
        if (other !== undefined) {
            throw new Error(
                `The ${other} and ${definition.name} collections both give their ids the brand '${brand}'. Each needs its own, like 'ArticleId'.`
            );
        }
        owners.set(brand, definition.name);
        brandSchemas.set(brand, brandShape(definition.id));
    }
    for (const entry of allPages) {
        const served = entry.page.collection;
        if (served !== undefined && !(options.collections ?? []).includes(served)) {
            throw new Error(
                `${entry.page.name} shows the ${served.name} collection, which cmsPlugin is not given. Add it to \`collections\`.`
            );
        }
    }
    for (const [name, definition] of definitions) {
        for (const field of allFields(describeFields(definition))) {
            const roles =
                field.auth?.roles === undefined ? [] : typeof field.auth.roles === 'string' ? [field.auth.roles] : field.auth.roles;
            for (const role of roles) {
                if (!declared.includes(role)) {
                    throw new Error(`${name} field '${field.path}' accepts the role '${role}', which ${label} does not declare.`);
                }
            }
            const catalog = identityRoles?.permissions?.catalog ?? {};
            for (const [resource, verbs] of Object.entries(field.auth?.requires ?? {})) {
                for (const verb of verbs) {
                    if (!catalog[resource]?.includes(verb)) {
                        throw new Error(`${name} field '${field.path}' requires '${resource}:${verb}', which ${label} does not declare.`);
                    }
                }
            }
            const branded = brandedSchemaOf(field.schema);
            const brand = branded === undefined ? undefined : brandOf(branded);
            if (branded !== undefined && brand !== undefined) {
                const shape = brandShape(branded);
                const seen = brandSchemas.get(brand);
                if (seen !== undefined && seen !== shape) {
                    throw new Error(
                        `Two different schemas carry the brand '${brand}'. Brand names are unique; prefix one, like 'ShopifyProductId'.`
                    );
                }
                brandSchemas.set(brand, shape);
            }
        }
    }
    for (const [brand, brandOptions] of Object.entries(options.brands ?? {})) {
        if (brandOptions.search === undefined || typeof brandOptions.search === 'function') continue;
        if (service.searchToolFor(brand) === undefined) {
            throw new Error(`The search route for brand '${brand}' is not one the api serves, or does not declare \`tool\`.`);
        }
    }
    void api;
};

const definition = definePlugin({
    slug: 'cms',
    options: CmsPluginOptionsSchema,
    setup: ({ options, api }) => {
        const service = new CmsService(options, api);
        const generators = Object.values(sitesOf(options)).flatMap((declared) => {
            const appDir = declared.app ?? (options.sites === undefined ? findAppDir() : undefined);
            return appDir === undefined
                ? []
                : [
                      pagesGenerator({
                          output: declared.output ?? defaultPagesOutput(appDir),
                          appDir,
                      }),
                  ];
        });
        const exports: CmsExports = {
            pages: service.pages,
            sites: options.sites ?? {},
            globals: options.globals ?? [],
            collections: options.collections ?? [],
            invalidate: (brand, id) => service.invalidate(brand, id),
            previewToken: () => service.previewToken(),
            service,
        };
        return {
            exports,
            generators,
            validate: () => validate(service, options, api),
        };
    },
});

/**
 * Content for the pages of a Next.js site, stored in the app's own database.
 * Pages declare their fields with `definePage()`, editors change them through the
 * routes `cmsRoutes` adds, and `createCms` reads them in server components.
 *
 * @example
 * const cms = cmsPlugin({
 *     db,
 *     pages,
 *     auth: {
 *         identity: 'editor',
 *         roles: ['editor', 'admin'],
 *     },
 * });
 *
 * export default defineConfig({
 *     routes: {
 *         ...routes,
 *         cms: cmsRoutes(cms),
 *     },
 *     plugins: [cms],
 * });
 */
export function cmsPlugin<
    const Pages extends PageMap = PageMap,
    const Globals extends readonly Global[] = readonly [],
    const Collections extends readonly Collection[] = readonly [],
    const Sites extends Record<string, SiteOptions> = {},
    const Slug extends string = string,
>(
    options: CmsPluginOptions<Pages, Sites> & {
        globals?: Globals;
        collections?: Collections;
        slug: Slug;
    }
): PluginDeclaration<Slug, CmsSetup<Pages, Globals, Collections, Sites>>;
export function cmsPlugin<
    const Pages extends PageMap = PageMap,
    const Globals extends readonly Global[] = readonly [],
    const Collections extends readonly Collection[] = readonly [],
    const Sites extends Record<string, SiteOptions> = {},
>(
    options: CmsPluginOptions<Pages, Sites> & {
        globals?: Globals;
        collections?: Collections;
    }
): PluginDeclaration<'cms', CmsSetup<Pages, Globals, Collections, Sites>>;
export function cmsPlugin(options: CmsPluginOptions & { slug?: string }): PluginDeclaration<string, CmsSetup> {
    return (definition as unknown as (options: unknown) => PluginDeclaration<string, CmsSetup>)(options);
}
