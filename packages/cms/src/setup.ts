import { z } from 'zod';
import { definePlugin, route, type PluginDeclaration, type PluginApi } from 'kizunajs/plugin';
import { adapterContextOf, authenticate, rawResponse } from 'kizunajs/adapter';
import { defineGenerator, encodeForWire, readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { CmsService } from './cms.js';
import { brandOf } from './cms.js';
import { routeProblems } from './dynamic.js';
import { CmsPluginOptionsSchema, DEFAULT_SITE, sitesOf, type CmsPluginOptions, type PageMap, type ResolvedCmsOptions } from './options.js';
import type { DeclaredSites } from './site.js';
import { choosesSites, type Collection, type ContentDefinition, type Global } from './definitions.js';
import { describeFields, fieldChain, type DescribedField } from './content.js';
import { dataFields } from './field.js';
import { defaultPagesOutput, discoverPages, findAppDir, renderPagesModule } from './discovery.js';
import { PREVIEW_COOKIE, PREVIEW_TTL_SECONDS } from './preview-token.js';
import { PREVIEW_PROXY_PATH, PROXY_CORS, previewProxyUrl, proxyToSite } from './preview-proxy.js';
import { draftEventsRoute } from './draft-events.js';
import { adminRoutes, signInLocationOf } from './admin/route.js';
import { signInRoute, signInScreenRoute, signOutRoute } from './admin/sign-in-route.js';
import { routePrefix } from './options.js';
import { assertActionAccess, resolveActions } from './action.js';
import { assertViews } from './view-routes.js';
import { assertTree } from './tree.js';
import { assertDashboard } from './dashboard.js';
import { resolve } from 'node:path';

/**
 * What handlers reach at `plugins.cms`.
 */
export interface CmsExports<
    Pages extends PageMap = PageMap,
    Globals extends readonly Global[] = readonly Global[],
    Collections extends readonly Collection[] = readonly Collection[],
    Sites extends DeclaredSites<any, any> | undefined = DeclaredSites | undefined,
> {
    /**
     * The pages, as the generated module declared them.
     */
    pages: Pages;
    /**
     * The sites `declareSites()` made, when the CMS serves several.
     */
    sites: Sites;
    /**
     * The globals cms() was given.
     */
    globals: Globals;
    /**
     * The collections cms() was given.
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
    Sites extends DeclaredSites<any, any> | undefined = DeclaredSites | undefined,
> {
    exports: CmsExports<Pages, Globals, Collections, Sites>;
}

const pagesGenerator = defineGenerator({
    options: z.object({
        appDir: z.string(),
        pagesModule: z.string(),
    }),
    generate: ({ options }) => ({
        finalize: () => {
            const appDir = resolve(/* turbopackIgnore: true */ process.cwd(), options.appDir);
            return renderPagesModule(discoverPages(appDir), resolve(/* turbopackIgnore: true */ process.cwd(), options.pagesModule));
        },
    }),
});

/**
 * The pages module of a single-site project. With several sites, their pages
 * modules are written by hand in the content package.
 */
const pagesGenerators = (options: ResolvedCmsOptions) => {
    if (options.sites !== undefined) return [];
    const appDir = options.appDir ?? findAppDir();
    if (appDir === undefined) return [];
    const output = options.pagesOutput ?? defaultPagesOutput(appDir);
    return [
        pagesGenerator({
            output,
            appDir,
            pagesModule: output,
        }),
    ];
};

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
            override: encodeForWire,
        })
    ).replace(/"description":"[^"]*",?/g, '');

const allFields = (fields: readonly DescribedField[]): DescribedField[] =>
    fields.flatMap((field) => [
        field,
        ...allFields(field.fields ?? []),
        ...(field.blocks ?? []).flatMap((block) => allFields(block.fields)),
    ]);

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
    if (options.auth.sites !== undefined && !declared.includes('admin')) {
        throw new Error(
            `cms() gives editors roles on sites, and an admin over every site holds the role 'admin', which ${label} does not declare.`
        );
    }
    const jobsIdentity = options.jobs?.identity;
    if (
        jobsIdentity !== undefined &&
        (api as { securitySchemes?: Record<string, unknown> }).securitySchemes?.[jobsIdentity] === undefined
    ) {
        throw new Error(`cms() runs its refresh job as the identity '${jobsIdentity}', which \`auth.identities\` does not declare.`);
    }
    const brandSchemas = new Map<string, string>();
    const siteEntries = Object.entries(options.sites?.entries ?? {});
    const ownCollections = [...new Set(siteEntries.flatMap(([, entry]) => entry.collections ?? []))];
    const ownGlobals = [...new Set(siteEntries.flatMap(([, entry]) => entry.globals ?? []))];
    const allCollections = [...new Set([...(options.collections ?? []), ...ownCollections])];
    const definitions: Array<[string, ContentDefinition]> = [
        ...Object.entries(sitesOf(options)).flatMap(([site, declared]) =>
            Object.entries(declared.pages).map(([name, entry]): [string, ContentDefinition] => [
                site === DEFAULT_SITE ? `Page '${name}'` : `Page '${name}' of the ${site} site`,
                entry.page,
            ])
        ),
        ...[...(options.globals ?? []), ...ownGlobals].map((definition): [string, ContentDefinition] => [
            `Global '${definition.name}'`,
            definition,
        ]),
        ...allCollections.map((definition): [string, ContentDefinition] => [`Collection '${definition.name}'`, definition]),
    ];
    const names = new Map<string, string>();
    for (const definition of [...(options.globals ?? []), ...(options.collections ?? [])]) {
        if (names.has(definition.name)) {
            throw new Error(`Two globals or collections are named '${definition.name}'. Give one of them another name.`);
        }
        names.set(definition.name, definition.name);
    }
    for (const [site, entry] of siteEntries) {
        const own = new Set<string>();
        for (const definition of [...(entry.globals ?? []), ...(entry.collections ?? [])]) {
            if (names.has(definition.name)) {
                throw new Error(
                    `The ${site} site has its own '${definition.name}', which repeats a shared global or collection. Give it another name.`
                );
            }
            if (own.has(definition.name)) {
                throw new Error(
                    `The ${site} site has two globals or collections named '${definition.name}'. Give one of them another name.`
                );
            }
            own.add(definition.name);
        }
    }
    const allPages = Object.values(sitesOf(options)).flatMap((declared) => Object.values(declared.pages));
    const problems = allPages.flatMap((entry) => routeProblems(entry.path, entry.page));
    if (problems.length > 0) throw new Error(problems.join('\n'));
    const owners = new Map<string, string>();
    for (const definition of allCollections) {
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
    for (const definition of allCollections) {
        assertActionAccess(resolveActions(definition.actions), `Collection '${definition.name}'`, identityRoles, label);
        assertTree(definition);
    }
    assertViews(options.views ?? [], [...names.keys()], identityRoles, label);
    assertDashboard(options, identityRoles, label);
    for (const [site, declared] of Object.entries(sitesOf(options))) {
        const reachable = [...(options.collections ?? []), ...(options.sites?.entries[site]?.collections ?? [])];
        for (const entry of Object.values(declared.pages)) {
            const served = entry.page.collection;
            if (served === undefined || reachable.includes(served)) continue;
            throw new Error(
                site === DEFAULT_SITE
                    ? `${entry.page.name} shows the ${served.name} collection, which cms() is not given. Add it to \`collections\`.`
                    : `${entry.page.name} of the ${site} site shows the ${served.name} collection, which neither cms() nor the ${site} site has. Add it to \`collections\` on one of them.`
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
    assertSiteFields(service, options);
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

/**
 * Checks `perSite` and `sites` on fields and pages: the sites they name are
 * declared, `perSite` sits on a shared global's or collection's own field that
 * is no part of an address or an index, and a field some sites leave out may
 * be empty.
 */
const assertSiteFields = (service: CmsService, options: ResolvedCmsOptions): void => {
    const declared = service.siteNames();
    const known = (owner: string, sites: readonly string[]): void => {
        for (const site of sites) {
            if (declared.includes(site)) continue;
            throw new Error(
                declared.length === 0
                    ? `${owner} names the site '${site}', but cms() declares no sites. Declare them with declareSites().`
                    : `${owner} names the site '${site}', which declareSites() does not declare. It declares ${declared.join(', ')}.`
            );
        }
    };
    const check = (label: string, definition: ContentDefinition, shared: boolean, locked: readonly string[]): void => {
        for (const field of allFields(describeFields(definition))) {
            const declaredField = dataFields(definition.fields).find((candidate) => candidate.name === field.path);
            const own = declaredField ?? findNested(definition, field.path);
            if (own?.perSite !== true && own?.sites === undefined) continue;
            const owner = `${label} field '${field.path}'`;
            if (declaredField === undefined) {
                throw new Error(`${owner} sits inside another field. perSite and sites go on a field of the document itself.`);
            }
            if (declaredField.sites !== undefined) {
                known(owner, declaredField.sites);
                if (!z.safeParse(declaredField.schema, undefined).success) {
                    throw new Error(`${owner} is missing on every other site, so its schema needs \`.optional()\`.`);
                }
            }
            if (declaredField.perSite === true) {
                if (!shared) {
                    throw new Error(`${owner} is perSite, but only shared content has values a site sets. Take off \`perSite\`.`);
                }
                if (declared.length === 0)
                    throw new Error(`${owner} is perSite, but cms() declares no sites. Declare them with declareSites().`);
                if (locked.includes(field.path)) {
                    throw new Error(`${owner} is indexed, so every site shares it. Take off \`perSite\`.`);
                }
            }
        }
    };
    for (const definition of options.globals ?? []) check(`Global '${definition.name}'`, definition, true, []);
    for (const definition of options.collections ?? []) {
        const listing = service.listing(definition.name);
        check(`Collection '${definition.name}'`, definition, true, [
            ...listing.indexes,
            ...(definition.tree === undefined ? [] : [definition.tree]),
        ]);
    }
    for (const definition of options.collections ?? []) {
        if (choosesSites(definition) && declared.length === 0) {
            throw new Error(
                `Collection '${definition.name}' chooses sites, but cms() declares no sites. Declare them with declareSites().`
            );
        }
    }
    for (const [site, entry] of Object.entries(options.sites?.entries ?? {})) {
        for (const definition of [...(entry.globals ?? []), ...(entry.collections ?? [])]) {
            check(`The ${site} site's '${definition.name}'`, definition, false, []);
        }
        for (const definition of entry.collections ?? []) {
            if (choosesSites(definition)) {
                throw new Error(
                    `The ${site} site's '${definition.name}' chooses sites, but only a shared collection shows on several. Take off \`chooseSites\`, or list it under \`collections\` on cms().`
                );
            }
        }
        for (const [name, page] of Object.entries(entry.pages ?? {})) {
            if (page.page.sites !== undefined) known(`Page '${name}'`, page.page.sites);
            check(`Page '${name}' of the ${site} site`, page.page, false, []);
        }
    }
    if (options.sites === undefined) {
        for (const [name, page] of Object.entries(options.pages ?? {})) {
            if (page.page.sites !== undefined) known(`Page '${name}'`, page.page.sites);
            check(`Page '${name}'`, page.page, false, []);
        }
    }
};

/**
 * A field inside another, by its dotted path, to name it in an error.
 */
const findNested = (definition: ContentDefinition, path: string): { perSite?: boolean; sites?: readonly string[] } | undefined => {
    const chain = fieldChain(definition.fields, path);
    return chain?.[chain.length - 1];
};

const definition = definePlugin({
    slug: 'cms',
    options: CmsPluginOptionsSchema,
    setup: ({ options, api }) => {
        const service = new CmsService(options, api);
        const generators = pagesGenerators(options);
        const base = routePrefix(options.path);
        const exports: CmsExports = {
            pages: service.pages,
            sites: options.sites,
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
                draftEvents: draftEventsRoute(service, options, api, base),
                previewProxy: previewProxyRoute(service, options, base),
                previewProxyPreflight: previewProxyPreflightRoute(base),
                ...adminRoutes(service, options, api, base),
                ...(options.auth.signIn === undefined
                    ? {}
                    : {
                          signInScreen: signInScreenRoute(service, options, api, base),
                          signIn: signInRoute(options, base),
                      }),
                ...(options.auth.signOut === undefined
                    ? {}
                    : {
                          signOut: signOutRoute(service, options, base),
                      }),
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
 * with no link goes to sign in first. `renew` swaps in a fresh preview
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
            const location = signInLocationOf(
                options,
                base,
                `${options.apiPath ?? '/api'}${base}/draft?redirect=${encodeURIComponent(target)}`
            );
            if (location === undefined) {
                return rawResponse(
                    new Response('Sign in as an editor first.', {
                        status: 401,
                    })
                );
            }
            return rawResponse(redirect(location));
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
 * `GET /preview/proxy`: one of the site's URLs in draft mode, for the editor
 * in a host that will not frame the site. See `preview-proxy.ts`.
 */
const previewProxyRoute = (service: CmsService, options: ResolvedCmsOptions, base: '' | `/${string}`) =>
    route({
        method: 'GET',
        path: `${base}${PREVIEW_PROXY_PATH}`,
        auth: false,
        summary: "The site's draft, for the editor",
        query: z.object({
            path: z.string(),
            token: z.string(),
            document: z.string().optional(),
        }),
        responses: {
            200: z.unknown(),
        },
    }).handler(async (args) => {
        const query = args.query as {
            path: string;
            token: string;
            document?: string;
        };
        if (options.preview === undefined) {
            return rawResponse(
                new Response('Set `preview.url` on cms() so the CMS knows where the site is.', {
                    status: 404,
                    headers: PROXY_CORS,
                })
            );
        }
        if (!service.verifiesPreview(query.token)) {
            return rawResponse(
                new Response('The preview link ran out. The editor fetches a new one.', {
                    status: 401,
                    headers: PROXY_CORS,
                })
            );
        }
        const apiPath = options.apiPath ?? '/api';
        try {
            return rawResponse(
                await proxyToSite({
                    target: {
                        site: new URL(options.preview.url).origin,
                        proxy: previewProxyUrl(options.preview.url, apiPath, base),
                        token: query.token,
                    },
                    draftPath: `${apiPath}${base}/draft`,
                    path: query.path.startsWith('/') ? query.path : `/${query.path}`,
                    headers: args.headers as Record<string, string | string[] | undefined>,
                    ttlMs: PREVIEW_TTL_SECONDS * 1000,
                    document: query.document === '1',
                })
            );
        } catch (error) {
            return rawResponse(
                new Response(`The site did not answer: ${error instanceof Error ? error.message : String(error)}`, {
                    status: 502,
                    headers: PROXY_CORS,
                })
            );
        }
    });

/**
 * `OPTIONS /preview/proxy`: lets the page's own requests through CORS.
 */
const previewProxyPreflightRoute = (base: '' | `/${string}`) =>
    route({
        method: 'OPTIONS',
        path: `${base}${PREVIEW_PROXY_PATH}`,
        auth: false,
        summary: "Lets the editor's page call the proxy",
        responses: {
            204: z.void(),
        },
    }).handler(async () =>
        rawResponse(
            new Response(null, {
                status: 204,
                headers: PROXY_CORS,
            })
        )
    );

/**
 * The CMS's server half, installed by `cms()`: its service, the draft route,
 * the pages module it generates and the checks it runs.
 */
export const cmsPluginDeclaration = (options: CmsPluginOptions): PluginDeclaration<'cms', CmsSetup> =>
    (definition as unknown as (options: unknown) => PluginDeclaration<'cms', CmsSetup>)(options);
