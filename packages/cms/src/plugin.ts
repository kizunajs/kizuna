import { z } from 'zod';
import { definePlugin, type PluginDeclaration, type PluginApi } from 'kizunajs/plugin';
import { defineGenerator } from 'kizunajs/generator';
import { CmsService } from './cms.js';
import { brandOf } from './cms.js';
import { CmsPluginOptionsSchema, type CmsPluginOptions, type PageMap, type ResolvedCmsOptions } from './options.js';
import { describeFields, type DescribedField } from './content.js';
import { defaultPagesOutput, discoverPages, findAppDir, renderPagesModule } from './discovery.js';
import { resolve } from 'node:path';

/**
 * What handlers reach at `plugins.cms`.
 */
export interface CmsExports<Pages extends PageMap = PageMap> {
    /**
     * The pages, as the generated module declared them.
     */
    pages: Pages;
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

export interface CmsSetup<Pages extends PageMap = PageMap> {
    exports: CmsExports<Pages>;
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
    for (const [name, entry] of Object.entries(options.pages)) {
        for (const field of allFields(describeFields(entry.page))) {
            const roles =
                field.auth?.roles === undefined ? [] : typeof field.auth.roles === 'string' ? [field.auth.roles] : field.auth.roles;
            for (const role of roles) {
                if (!declared.includes(role)) {
                    throw new Error(`Page '${name}' field '${field.path}' accepts the role '${role}', which ${label} does not declare.`);
                }
            }
            const catalog = identityRoles?.permissions?.catalog ?? {};
            for (const [resource, verbs] of Object.entries(field.auth?.requires ?? {})) {
                for (const verb of verbs) {
                    if (!catalog[resource]?.includes(verb)) {
                        throw new Error(
                            `Page '${name}' field '${field.path}' requires '${resource}:${verb}', which ${label} does not declare.`
                        );
                    }
                }
            }
            const brand = brandOf(field.schema);
            if (brand !== undefined) {
                const shape = JSON.stringify(
                    z.toJSONSchema(field.schema as z.ZodType, {
                        unrepresentable: 'any',
                        io: 'input',
                    })
                ).replace(/"(maxItems|minItems|description)":[^,}]*,?/g, '');
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
        if (brandOptions.search === undefined) continue;
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
        const appDir = options.appDir ?? (findAppDir() === undefined ? undefined : findAppDir()!);
        const exports: CmsExports = {
            pages: options.pages,
            invalidate: (brand, id) => service.invalidate(brand, id),
            previewToken: () => service.previewToken(),
            service,
        };
        return {
            exports,
            generators:
                appDir === undefined
                    ? []
                    : [
                          pagesGenerator({
                              output: options.pagesOutput ?? defaultPagesOutput(appDir),
                              appDir,
                          }),
                      ],
            validate: () => validate(service, options, api),
        };
    },
});

/**
 * Content for the pages of a Next.js site, stored in the app's own database.
 * Pages declare their fields with `page()`, editors change them through the
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
export function cmsPlugin<const Pages extends PageMap, const Slug extends string>(
    options: CmsPluginOptions<Pages> & {
        slug: Slug;
    }
): PluginDeclaration<Slug, CmsSetup<Pages>>;
export function cmsPlugin<const Pages extends PageMap>(options: CmsPluginOptions<Pages>): PluginDeclaration<'cms', CmsSetup<Pages>>;
export function cmsPlugin(options: CmsPluginOptions & { slug?: string }): PluginDeclaration<string, CmsSetup> {
    return (definition as unknown as (options: unknown) => PluginDeclaration<string, CmsSetup>)(options);
}
