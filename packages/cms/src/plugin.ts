import { z } from 'zod';
import { definePlugin, route, type PluginDeclaration, type PluginApi } from 'kizunajs/plugin';
import { adapterContextOf, authenticate, rawResponse } from 'kizunajs/adapter';
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
import { PREVIEW_COOKIE, PREVIEW_TTL_SECONDS } from './preview-token.js';
import { routePrefix } from './options.js';
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
    const label = `cms()'s identity '${options.auth.identity}'`;
    if (service.roles !== undefined) {
        if (identityRoles === undefined) throw new Error(`cms() names roles, but ${label} declares none.`);
        for (const role of service.roles) {
            if (!declared.includes(role)) throw new Error(`cms() accepts the role '${role}', which ${label} does not declare.`);
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
            throw new Error(`${entry.page.name} shows the ${served.name} collection, which cms() is not given. Add it to \`collections\`.`);
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
    const relationshipNames = new Set<string>();
    for (const relationship of options.relationships ?? []) {
        if (relationshipNames.has(relationship.name)) {
            throw new Error(`Two relationships are named '${relationship.name}'. Give one of them another name.`);
        }
        relationshipNames.add(relationship.name);
        const brand = brandOf(relationship.id);
        if (brand === undefined) {
            throw new Error(
                `The ${relationship.name} relationship's id has no brand. Make it with Kizuna.brand, like Kizuna.brand('ProductId', z.string()).`
            );
        }
        const owner = owners.get(brand);
        if (owner !== undefined) {
            throw new Error(
                `The ${relationship.name} relationship and the ${owner} collection both hold the brand '${brand}'. A collection already lists its own items.`
            );
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
        const base = routePrefix(options.path);
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
            routes: {
                draft: draftRoute(service, options, api, base),
            },
            validate: () => validate(service, options, api),
        };
    },
});

/**
 * A redirect, with headers the framework may still add cookies to.
 */
const redirect = (location: string): Response =>
    new Response(null, {
        status: 307,
        headers: {
            location,
        },
    });

/**
 * A same-origin path, or `/` for anything else, so draft mode never sends
 * someone off the site.
 */
const safeRedirect = (value: unknown): string =>
    typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/';

/**
 * `GET /draft`: opens draft mode for a signed-in editor, or for anyone holding
 * a link the editor minted, and lands them on `redirect`. A signed-out editor
 * with no link goes to `signInPath` first. `renew` swaps in a fresh preview
 * cookie for the preview, and `disable` leaves.
 */
const draftRoute = (service: CmsService, options: ResolvedCmsOptions, api: PluginApi, base: '' | `/${string}`) =>
    route({
        method: 'GET',
        path: `${base}/draft`,
        auth: false,
        summary: 'Open or close draft mode for an editor',
        query: z.object({
            redirect: z.string().optional(),
            renew: z.string().optional(),
            disable: z.string().optional(),
            token: z.string().optional(),
        }),
        responses: {
            200: z.object({
                expired: z.boolean(),
            }),
        },
    }).handler(async (args) => {
        const runtime = service.runtime;
        if (runtime === undefined) {
            return rawResponse(
                new Response('Draft mode needs an adapter that supplies it, such as nextAdapter().', {
                    status: 501,
                })
            );
        }
        const query = args.query as {
            redirect?: string;
            renew?: string;
            disable?: string;
            token?: string;
        };
        const draft = await runtime.draftMode();
        const jar = await runtime.cookies();
        const target = safeRedirect(query.redirect);
        if (query.disable !== undefined) {
            draft.disable();
            jar.delete(PREVIEW_COOKIE);
            return rawResponse(redirect(target));
        }
        // A link from the editor, which runs the site's draft inside a frame of the editor's own.
        const viaLink = query.token !== undefined && service.verifiesPreview(query.token);
        const context = adapterContextOf(args as unknown as Record<string, unknown>);
        const signedIn = viaLink
            ? undefined
            : await authenticate(
                  api,
                  options.auth.identity,
                  {
                      headers: args.headers as Record<string, string | string[] | undefined>,
                      query: args.query,
                  },
                  context
              );
        const role = signedIn?.['role'];
        const allowed =
            viaLink ||
            (signedIn !== undefined &&
                (service.roles === undefined ||
                    (Array.isArray(role) ? role : [role]).some((held) => service.roles!.includes(held as string))));
        if (!allowed) {
            if (query.renew !== undefined) {
                return rawResponse(
                    Response.json(
                        {
                            detail: 'Sign in as an editor.',
                        },
                        {
                            status: 401,
                        }
                    )
                );
            }
            if (options.signInPath === undefined) {
                return rawResponse(
                    new Response('Sign in as an editor first.', {
                        status: 401,
                    })
                );
            }
            const back = `${options.apiPath ?? '/api'}${base}/draft?redirect=${encodeURIComponent(target)}`;
            return rawResponse(redirect(`${options.signInPath}?next=${encodeURIComponent(back)}`));
        }
        const held = jar.get(PREVIEW_COOKIE);
        draft.enable();
        jar.set(
            PREVIEW_COOKIE,
            service.previewToken(),
            viaLink
                ? {
                      httpOnly: true,
                      sameSite: 'none',
                      secure: true,
                      partitioned: true,
                      path: '/',
                      maxAge: PREVIEW_TTL_SECONDS,
                  }
                : {
                      httpOnly: true,
                      sameSite: 'lax',
                      secure: process.env['NODE_ENV'] === 'production',
                      path: '/',
                      maxAge: PREVIEW_TTL_SECONDS,
                  }
        );
        if (query.renew !== undefined) {
            // The page rendered without drafts when the held cookie had run out.
            return rawResponse(
                Response.json({
                    expired: held === undefined || !service.verifiesPreview(held),
                })
            );
        }
        return rawResponse(redirect(target));
    });

/**
 * The CMS's server half, installed by `cms()`: its service, the draft route,
 * the pages module it generates and the checks it runs.
 */
export const cmsPluginDeclaration = (options: CmsPluginOptions): PluginDeclaration<'cms', CmsSetup> =>
    (definition as unknown as (options: unknown) => PluginDeclaration<'cms', CmsSetup>)(options);
