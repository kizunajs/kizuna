import { z } from 'zod';
import { route, type PluginDeclaration } from 'kizunajs/plugin';
import { BinarySchema, ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import type { RouteAuth } from 'kizunajs';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { addressOf, CmsHttpError, type CmsService, type DraftState } from './cms.js';
import { DEFAULT_SITE, routePrefix, sitesOf, type CmsPluginOptions, type PageMap } from './options.js';
import type { ContentDefinition } from './definitions.js';
import { servesCollection } from './page.js';
import { addressFieldsOf } from './dynamic.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { resolvedSchema } from './content-schema.js';
import {
    CreateItemBodySchema,
    CreateUploadBodySchema,
    DescribedPageSchema,
    DraftHeadersSchema,
    DraftPageSchema,
    EditorItemSchema,
    MediaListSchema,
    MediaSchema,
    MissingFieldsSchema,
    PageSummarySchema,
    PublishBodySchema,
    RollbackBodySchema,
    StoredContentSchema,
    UpdateDraftBodySchema,
    UpdateDraftHeadersSchema,
    UpdateMediaBodySchema,
    UploadSchema,
    VersionListSchema,
    WhereUsedSchema,
} from './wire.js';
import { UploadRejectedError } from './media/media.js';
import { ImageQuerySchema, InvalidateBodySchema } from './wire.js';

interface Args {
    params: Record<string, string>;
    query: Record<string, unknown> | undefined;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    throwError: (response: { status: number; body: unknown; headers?: Record<string, string> }) => never;
    plugins?: Record<string, unknown>;
    auth?: Record<string, Record<string, unknown>>;
}

type Handler = (args: Args) => Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>;

const words = (name: string): string =>
    name
        .replace(/Page$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();

const nameOf = (ref: DocumentRef): string => (ref.type === 'item' ? ref.id : ref.name);

const promptFor = (ref: DocumentRef): string => {
    if (ref.type === 'page') return `Fill in the ${words(ref.name)} page.`;
    if (ref.type === 'global') return `Fill in the ${words(ref.name)} settings.`;
    return `Fill in this ${words(ref.collection)} item.`;
};

const draftBody = (state: DraftState) => ({
    ref: formatRef(state.target.ref),
    name: nameOf(state.target.ref),
    path: addressOf(state.target, state.row?.draft ?? state.row?.published) ?? null,
    status: state.status,
    version: state.version,
    publishedVersion: state.row?.publishedVersion ?? null,
    content: state.row?.draft ?? null,
    complete: state.complete,
    missing: state.missing,
    updatedAt: state.row?.updatedAt.toISOString() ?? null,
    updatedBy: state.row?.updatedBy ?? null,
});

/**
 * Where an editing route finds its document, and what its paths and tool
 * descriptions call it.
 */
interface Scope {
    prefix: `/${string}`;
    params: z.ZodObject;
    refOf: (params: Record<string, string>) => DocumentRef;
    noun: string;
    /**
     * Whether an agent's draft writes wait for the person's approval. Content
     * an agent reads is written by other people, so an instruction hidden in
     * it should not reach what every page shows without someone seeing it.
     */
    approveWrites?: boolean;
}

/**
 * The query a list takes: one optional filter per index, and how to sort and
 * page.
 */
/**
 * The headers of the editor's own request that say who they are, for a
 * relationship's `options` to pass on.
 */
const forwardedHeaders = (args: Args): Record<string, string> => {
    const context = args as unknown as {
        request?: { headers?: Headers };
        req?: { headers?: Record<string, string | string[] | undefined> };
    };
    const read = (name: string): string | undefined => {
        const fromFetch = context.request?.headers?.get?.(name);
        if (fromFetch !== undefined && fromFetch !== null) return fromFetch;
        const fromNode = context.req?.headers?.[name];
        return Array.isArray(fromNode) ? fromNode.join(', ') : fromNode;
    };
    const forwarded: Record<string, string> = {};
    for (const name of ['cookie', 'authorization']) {
        const value = read(name);
        if (value !== undefined) forwarded[name] = value;
    }
    return forwarded;
};

/**
 * What the search route hands a collection or a relationship: the search
 * term, or the ids to name, and who is asking.
 */
const searchInput = (args: Args): { query?: string; ids?: string[]; headers: Record<string, string> } => {
    const { q, ids } = (args.query ?? {}) as { q?: string; ids?: string[] };
    return {
        ...(q === undefined
            ? {}
            : {
                  query: q,
              }),
        ...(ids === undefined
            ? {}
            : {
                  ids,
              }),
        headers: forwardedHeaders(args),
    };
};

const listQueryOf = (definition: ContentDefinition, indexes: readonly string[]) => {
    const shape: Record<string, z.ZodType> = {};
    for (const index of indexes) {
        const field = definition.fields.find((candidate) => candidate.name === index)!;
        const inner = unwrapOptionalWrappers(field.schema).inner as z.ZodType;
        const type = readDef(inner).type;
        shape[index] = (
            type === 'string' || type === 'enum' || type === 'number' || type === 'int' || type === 'boolean' ? inner : z.string()
        ).optional();
    }
    return z
        .object({
            ...shape,
            orderBy: z.enum([...indexes, 'publishedAt', 'updatedAt']).optional(),
            direction: z.enum(['asc', 'desc']).optional(),
            limit: z.int().min(1).max(200).optional(),
            cursor: z.string().optional().describe('The `next` of the previous page.'),
        })
        .strict();
};

/**
 * The routes the CMS answers, which `cms()` hands `content` to join the API's
 * own: `content` for anyone reading published content, `editing` for editors
 * and their agents, and `invalidate` for the app. They are ordinary routes, so
 * they reach the OpenAPI document, the generated clients and MCP like any
 * other.
 */
export const cmsRoutes = (declaration: PluginDeclaration<string, any>) => {
    const options = declaration.input as CmsPluginOptions;
    const slug = declaration.slug;
    const base = routePrefix(options.path);
    const editingBase: `/${string}` = `${base}/editing`;
    const editor: RouteAuth =
        options.auth.roles === undefined
            ? options.auth.identity
            : {
                  identity: options.auth.identity,
                  roles: options.auth.roles,
              };

    const serviceOf = (args: Args): CmsService => {
        const exported = args.plugins?.[slug] as { service?: CmsService } | undefined;
        if (exported?.service === undefined) {
            throw new Error(`The CMS routes found no CMS at plugins.${slug}. Hand cms() to \`content\`.`);
        }
        return exported.service;
    };

    const guarded =
        (fn: (cms: CmsService, args: Args) => Promise<{ status: number; body?: unknown; headers?: Record<string, string> }>): Handler =>
        async (args) => {
            const cms = serviceOf(args);
            try {
                return await fn(cms, args);
            } catch (error) {
                if (error instanceof CmsHttpError) {
                    return args.throwError({
                        status: error.status,
                        body: error.body,
                    });
                }
                if (error instanceof UploadRejectedError) {
                    return args.throwError({
                        status: 422,
                        body: {
                            detail: error.message,
                            errors: [],
                        },
                    });
                }
                throw error;
            }
        };

    const authorOf = (cms: CmsService, args: Args): string => cms.author(args.auth?.[cms.identity]);

    const withUrl = (cms: CmsService, record: Awaited<ReturnType<CmsService['media']['get']>> & object) => ({
        ...record,
        url: cms.imageUrl(record.id),
    });

    const editingRoutes = (scope: Scope) => ({
        getDraft: route({
            method: 'GET',
            path: `${editingBase}${scope.prefix}/draft`,
            auth: editor,
            summary: `Read the draft of ${scope.noun}`,
            tool: true,
            pathParams: scope.params,
            responses: {
                200: {
                    body: DraftPageSchema,
                    headers: DraftHeadersSchema,
                    cache: 'no-store',
                },
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const state = await cms.draftState(scope.refOf(args.params));
                return {
                    status: 200,
                    body: draftBody(state),
                    headers: {
                        etag: state.etag,
                    },
                };
            }) as never
        ),

        updateDraft: route({
            method: 'PATCH',
            path: `${editingBase}${scope.prefix}/draft`,
            auth: editor,
            summary: `Change fields on the draft of ${scope.noun}`,
            description:
                'Changes are keyed by field path and merged into the draft, which is then checked against the whole schema. Describe the document first to learn the paths, the schemas and which fields you may write. Nothing goes live until it is published.',
            tool:
                scope.approveWrites === true
                    ? {
                          needsApproval: true,
                      }
                    : true,
            pathParams: scope.params,
            headers: UpdateDraftHeadersSchema,
            body: UpdateDraftBodySchema,
            responses: {
                200: {
                    body: DraftPageSchema,
                    headers: DraftHeadersSchema,
                    cache: 'no-store',
                },
                404: ProblemDetailsSchema,
                409: ProblemDetailsSchema,
                422: ValidationErrorSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const body = args.body as z.output<typeof UpdateDraftBodySchema>;
                const state = await cms.update({
                    ref: scope.refOf(args.params),
                    changes: body.changes,
                    caller: cms.caller(args.auth),
                    author: authorOf(cms, args),
                    summary: body.summary,
                    ifMatch: args.headers['if-match'],
                    autosave: body.autosave,
                });
                return {
                    status: 200,
                    body: draftBody(state),
                    headers: {
                        etag: state.etag,
                    },
                };
            }) as never
        ),

        missingFields: route({
            method: 'GET',
            path: `${editingBase}${scope.prefix}/missing`,
            auth: editor,
            summary: `List the fields the draft of ${scope.noun} still needs before it can publish`,
            tool: true,
            pathParams: scope.params,
            responses: {
                200: MissingFieldsSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const ref = scope.refOf(args.params);
                const state = await cms.draftState(ref);
                return {
                    status: 200,
                    body: {
                        name: nameOf(ref),
                        complete: state.complete,
                        missing: state.missing,
                        prompt: promptFor(ref),
                    },
                };
            }) as never
        ),

        getPublished: route({
            method: 'GET',
            path: `${editingBase}${scope.prefix}/published`,
            auth: editor,
            summary: `Read the published content of ${scope.noun} as stored, for copying it elsewhere`,
            pathParams: scope.params,
            responses: {
                200: {
                    body: StoredContentSchema,
                    cache: 'no-store',
                },
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const ref = scope.refOf(args.params);
                const stored = await cms.publishedAsStored(ref);
                if (stored === undefined) throw new CmsHttpError(404, { detail: `'${formatRef(ref)}' is not published.` });
                return {
                    status: 200,
                    body: {
                        ref: formatRef(ref),
                        version: stored.version,
                        updatedAt: stored.updatedAt.toISOString(),
                        content: stored.content,
                    },
                };
            }) as never
        ),

        history: route({
            method: 'GET',
            path: `${editingBase}${scope.prefix}/versions`,
            auth: editor,
            summary: `List the versions of ${scope.noun}, newest first`,
            tool: true,
            pathParams: scope.params,
            responses: {
                200: VersionListSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const ref = scope.refOf(args.params);
                return {
                    status: 200,
                    body: {
                        name: nameOf(ref),
                        versions: await cms.history(ref),
                    },
                };
            }) as never
        ),

        publish: route({
            method: 'POST',
            path: `${editingBase}${scope.prefix}/publish`,
            auth: editor,
            summary: `Publish the draft of ${scope.noun}`,
            description: 'Makes the current draft what every visitor sees. The person confirms before this runs.',
            tool: {
                needsApproval: true,
                destructiveHint: false,
                idempotentHint: true,
            },
            pathParams: scope.params,
            body: PublishBodySchema,
            responses: {
                200: DraftPageSchema,
                404: ProblemDetailsSchema,
                409: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 200,
                body: draftBody(await cms.publish(scope.refOf(args.params), authorOf(cms, args))),
            })) as never
        ),

        rollback: route({
            method: 'POST',
            path: `${editingBase}${scope.prefix}/rollback`,
            auth: editor,
            summary: `Restore an earlier version of ${scope.noun} as a new draft`,
            description: 'Nothing is published by this. The restored content becomes the draft, which is published separately.',
            tool: {
                needsApproval: true,
                destructiveHint: false,
            },
            pathParams: scope.params,
            body: RollbackBodySchema,
            responses: {
                200: DraftPageSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 200,
                body: draftBody(
                    await cms.rollback(
                        scope.refOf(args.params),
                        (args.body as z.output<typeof RollbackBodySchema>).version,
                        authorOf(cms, args)
                    )
                ),
            })) as never
        ),
    });

    const publicCache = {
        etag: true,
        cache: {
            scope: 'public',
            maxAge: 0,
            staleWhileRevalidate: 60,
        },
    } as never;

    /**
     * The public list and get of a collection's items.
     */
    const listingReads = (input: {
        definition: ContentDefinition;
        indexes: readonly string[];
        path: `/${string}`;
        collection: string;
        refOf: (id: string) => DocumentRef;
        plural: string;
        single: string;
    }) => {
        const item = (resolvedSchema(input.definition.schema) as z.ZodObject).extend({
            id: z.string(),
        });
        return {
            list: route({
                method: 'GET',
                path: input.path,
                auth: false,
                summary: `List the published ${input.plural}`,
                query: listQueryOf(input.definition, input.indexes),
                responses: {
                    200: {
                        body: z.object({
                            items: z.array(item),
                            next: z.string().nullable(),
                        }),
                        ...(publicCache as object),
                    },
                    400: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    const { orderBy, direction, limit, cursor, ...where } = (args.query ?? {}) as Record<string, unknown>;
                    const result = await cms.listItems(input.collection, {
                        draft: false,
                        where: Object.fromEntries(Object.entries(where).filter(([, value]) => value !== undefined)),
                        ...(typeof orderBy === 'string' ? { orderBy } : {}),
                        ...(direction === 'asc' || direction === 'desc' ? { direction } : {}),
                        ...(typeof limit === 'number' ? { limit } : {}),
                        ...(typeof cursor === 'string' ? { cursor } : {}),
                    });
                    return {
                        status: 200,
                        body: {
                            items: result.items,
                            next: result.next ?? null,
                        },
                    };
                }) as never
            ),
            get: route({
                method: 'GET',
                path: `${input.path}/:id`,
                auth: false,
                summary: `Read one published ${input.single}`,
                pathParams: z.object({
                    id: z.string(),
                }),
                responses: {
                    200: {
                        body: item,
                        ...(publicCache as object),
                    },
                    404: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    const published = await cms.published(input.refOf(args.params['id']!));
                    if (published === undefined)
                        throw new CmsHttpError(404, { detail: `No published ${input.single} '${args.params['id']}'.` });
                    return {
                        status: 200,
                        body: published.content,
                    };
                }) as never
            ),
        };
    };

    /**
     * The public read of each page a site serves at a path of its own.
     */
    const pageReadsOf = (pages: PageMap, site: string) =>
        Object.fromEntries(
            Object.entries(pages)
                .filter(([, entry]) => !servesCollection(entry.page))
                .map(([name, entry]) => [
                    name,
                    route({
                        method: 'GET',
                        path: site === DEFAULT_SITE ? `${base}/content/pages/${name}` : `${base}/content/sites/${site}/pages/${name}`,
                        auth: false,
                        summary:
                            site === DEFAULT_SITE
                                ? `Read the published content of ${entry.path}`
                                : `Read the published content of ${entry.path} on the ${site} site`,
                        responses: {
                            200: {
                                body: z.object({
                                    version: z.int(),
                                    updatedAt: z.string(),
                                    content: resolvedSchema(entry.page.schema),
                                }),
                                ...(publicCache as object),
                            },
                            404: ProblemDetailsSchema,
                        },
                    }).handler(
                        guarded(async (cms) => {
                            const published = await cms.published({
                                type: 'page',
                                name,
                                ...(site === DEFAULT_SITE
                                    ? {}
                                    : {
                                          site,
                                      }),
                            });
                            if (published === undefined) throw new CmsHttpError(404, { detail: `${entry.path} is not published.` });
                            return {
                                status: 200,
                                body: {
                                    version: published.version,
                                    updatedAt: published.updatedAt.toISOString(),
                                    content: published.content,
                                },
                            };
                        }) as never
                    ),
                ])
        );

    const sites = sitesOf(options);
    const pageReads = pageReadsOf(sites[DEFAULT_SITE]?.pages ?? {}, DEFAULT_SITE);
    const namedSites = Object.entries(sites).filter(([site]) => site !== DEFAULT_SITE);
    const siteReads = Object.fromEntries(namedSites.map(([site, declared]) => [site, pageReadsOf(declared.pages, site)]));

    const globalReads = Object.fromEntries(
        (options.globals ?? []).map((definition) => [
            definition.name,
            route({
                method: 'GET',
                path: `${base}/content/globals/${definition.name}`,
                auth: false,
                summary: `Read the published ${words(definition.name)} global`,
                responses: {
                    200: {
                        body: z.object({
                            version: z.int(),
                            updatedAt: z.string(),
                            content: resolvedSchema(definition.schema),
                        }),
                        ...(publicCache as object),
                    },
                    404: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms) => {
                    const published = await cms.published({
                        type: 'global',
                        name: definition.name,
                    });
                    if (published === undefined) throw new CmsHttpError(404, { detail: `The ${definition.name} global is not published.` });
                    return {
                        status: 200,
                        body: {
                            version: published.version,
                            updatedAt: published.updatedAt.toISOString(),
                            content: published.content,
                        },
                    };
                }) as never
            ),
        ])
    );

    const collectionReads = Object.fromEntries(
        (options.collections ?? []).map((definition) => [
            definition.name,
            listingReads({
                definition,
                indexes: [
                    ...new Set([
                        // A param naming no field is refused when the config assembles, with the field it lacks.
                        ...Object.values(sites)
                            .flatMap((declared) => addressFieldsOf(definition.name, declared.pages))
                            .filter((field) => definition.fields.some((candidate) => candidate.name === field)),
                        ...(definition.indexes ?? []),
                    ]),
                ],
                path: `${base}/content/collections/${definition.name}`,
                collection: definition.name,
                refOf: (id) => ({
                    type: 'item',
                    collection: definition.name,
                    id,
                }),
                plural: words(definition.name),
                single: `item of ${words(definition.name)}`,
            }),
        ])
    );

    const pageScope: Scope = {
        prefix: '/pages/:name',
        params: z.object({
            name: z.string(),
        }),
        refOf: (params) => ({
            type: 'page',
            name: params['name']!,
        }),
        noun: 'a page',
    };
    const sitePageScope: Scope = {
        prefix: '/sites/:site/pages/:name',
        params: z.object({
            site: z.string(),
            name: z.string(),
        }),
        refOf: (params) => ({
            type: 'page',
            name: params['name']!,
            site: params['site']!,
        }),
        noun: 'a page of one site, when several apps share the CMS',
    };
    const globalScope: Scope = {
        prefix: '/globals/:name',
        params: z.object({
            name: z.string(),
        }),
        refOf: (params) => ({
            type: 'global',
            name: params['name']!,
        }),
        noun: 'a global, which every page may show',
        approveWrites: true,
    };
    /**
     * Listing, adding and deleting the items of a collection.
     */
    const itemRoutes = () => ({
        listItems: route({
            method: 'GET',
            path: `${editingBase}/collections/:name/items`,
            auth: editor,
            summary: 'List every item of a collection, drafts included, with its status and address',
            tool: true,
            pathParams: z.object({
                name: z.string(),
            }),
            responses: {
                200: z.object({
                    items: z.array(EditorItemSchema),
                }),
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 200,
                body: {
                    items: await cms.editorItems(args.params['name']!),
                },
            })) as never
        ),

        createItem: route({
            method: 'POST',
            path: `${editingBase}/collections/:name/items`,
            auth: editor,
            summary: 'Add an item to a collection, as a draft',
            tool: true,
            pathParams: z.object({
                name: z.string(),
            }),
            body: CreateItemBodySchema,
            responses: {
                201: DraftPageSchema,
                404: ProblemDetailsSchema,
                409: ProblemDetailsSchema,
                422: ValidationErrorSchema,
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 201,
                body: draftBody(
                    await cms.createItem(
                        args.params['name']!,
                        (args.body as z.output<typeof CreateItemBodySchema>)?.values ?? {},
                        cms.caller(args.auth),
                        authorOf(cms, args)
                    )
                ),
            })) as never
        ),

        deleteItem: route({
            method: 'DELETE',
            path: `${editingBase}/collections/:name/items/:id`,
            auth: editor,
            summary: 'Delete an item of a collection, with its history',
            description: 'Its address stops answering, and pages that reference it stop showing it. The person confirms before this runs.',
            tool: {
                needsApproval: true,
            },
            pathParams: z.object({
                name: z.string(),
                id: z.string(),
            }),
            responses: {
                204: z.void(),
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                await cms.deleteItem(args.params['name']!, args.params['id']!);
                return {
                    status: 204,
                    body: undefined,
                };
            }) as never
        ),
    });

    const itemScope: Scope = {
        prefix: '/collections/:name/items/:id',
        params: z.object({
            name: z.string(),
            id: z.string(),
        }),
        refOf: (params) => ({
            type: 'item',
            collection: params['name']!,
            id: params['id']!,
        }),
        noun: 'an item of a collection',
    };

    const describe = route({
        method: 'GET',
        path: `${editingBase}/describe`,
        auth: editor,
        summary: 'Describe what is shown at a URL, or any document by its ref: its fields, what the caller may write, and the draft',
        description:
            'Start here when working from the page someone is looking at, or from a ref a source path or another tool gave you. Each field carries its path, the JSON Schema a value has to pass, and whether you may write it. `usedOn` says where else shared content appears; say so before changing it.',
        tool: true,
        query: z.object({
            url: z.string().optional().describe('The page URL or path, like https://example.com/blog/spring-sale or /blog/spring-sale.'),
            site: z.string().optional().describe('The site the URL belongs to, when several apps share the CMS.'),
            ref: z.string().optional().describe('A document: page:<name>, global:<name> or item:<collection>:<id>.'),
        }),
        responses: {
            200: DescribedPageSchema,
            400: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const query = (args.query ?? {}) as { url?: string; ref?: string; site?: string };
            let ref: DocumentRef | undefined;
            if (query.ref !== undefined) {
                ref = parseRef(query.ref);
                if (ref === undefined) throw new CmsHttpError(400, { detail: `'${query.ref}' is not a ref.` });
            } else if (query.url !== undefined) {
                let path: string;
                try {
                    path = new URL(query.url, 'http://cms.local').pathname;
                } catch {
                    throw new CmsHttpError(404, { detail: `'${query.url}' is not a URL or a path.` });
                }
                ref = await cms.pageAt(path, query.site);
                if (ref === undefined) throw new CmsHttpError(404, { detail: `No page is served at '${path}'.` });
            } else {
                throw new CmsHttpError(400, { detail: 'Pass a url or a ref.' });
            }
            const state = await cms.draftState(ref);
            const draft = state.row?.draft ?? state.row?.published ?? null;
            return {
                status: 200,
                body: {
                    ref: formatRef(ref),
                    kind: state.target.kind,
                    name: nameOf(ref),
                    path: addressOf(state.target, draft) ?? null,
                    usedOn: await cms.usedOn(ref),
                    status: state.status,
                    version: state.version,
                    complete: state.complete,
                    missing: state.missing,
                    fields: cms.describe(ref, draft, cms.caller(args.auth)),
                    draft,
                },
                headers: {
                    etag: state.etag,
                },
            };
        }) as never
    );

    const listPages = route({
        method: 'GET',
        path: `${editingBase}/pages`,
        auth: editor,
        summary: 'List every page with its status',
        tool: true,
        responses: {
            200: z.object({
                pages: z.array(PageSummarySchema),
            }),
        },
    }).handler(
        guarded(async (cms) => ({
            status: 200,
            body: {
                pages: await cms.summaries(),
            },
        })) as never
    );

    const whereUsed = route({
        method: 'GET',
        path: `${editingBase}/refs/:brand/:id`,
        auth: editor,
        summary: 'List the pages that hold one branded id',
        tool: true,
        pathParams: z.object({
            brand: z.string(),
            id: z.string(),
        }),
        responses: {
            200: WhereUsedSchema,
        },
    }).handler(
        guarded(async (cms, args) => ({
            status: 200,
            body: {
                brand: args.params['brand']!,
                id: args.params['id']!,
                pages: await cms.whereUsed(args.params['brand']!, args.params['id']!),
            },
        })) as never
    );

    const listMedia = route({
        method: 'GET',
        path: `${editingBase}/media`,
        auth: editor,
        summary: 'List uploaded media',
        tool: true,
        responses: {
            200: MediaListSchema,
        },
    }).handler(
        guarded(async (cms) => ({
            status: 200,
            body: {
                media: (await cms.media.list()).map((record) => withUrl(cms, record)),
            },
        })) as never
    );

    const getMedia = route({
        method: 'GET',
        path: `${editingBase}/media/:id`,
        auth: editor,
        summary: 'Read one media item',
        tool: true,
        pathParams: z.object({
            id: z.string(),
        }),
        responses: {
            200: MediaSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const record = await cms.media.get(args.params['id']!);
            if (record === undefined) throw new CmsHttpError(404, { detail: `No media item '${args.params['id']}'.` });
            return {
                status: 200,
                body: withUrl(cms, record),
            };
        }) as never
    );

    const getMediaFile = route({
        method: 'GET',
        path: `${editingBase}/media/:id/file`,
        auth: editor,
        summary: 'The stored file of a media item, as uploaded, for copying between environments',
        pathParams: z.object({
            id: z.string(),
        }),
        responses: {
            200: {
                body: BinarySchema,
                contentType: 'application/octet-stream',
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const record = await cms.media.get(args.params['id']!);
            const bytes = record === undefined ? undefined : await cms.media.bytes(record);
            if (bytes === undefined) throw new CmsHttpError(404, { detail: `No media item '${args.params['id']}'.` });
            return {
                status: 200,
                body: bytes,
            };
        }) as never
    );

    const getImage = route({
        method: 'GET',
        path: `${base}/content/media/:id/image`,
        auth: false,
        summary: 'The image as a page shows it, cropped and sized by sharp',
        pathParams: z.object({
            id: z.string(),
        }),
        query: ImageQuerySchema,
        responses: {
            200: {
                body: BinarySchema,
                contentType: 'image/webp',
                cache: {
                    scope: 'public',
                    maxAge: 31536000,
                    immutable: true,
                },
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const record = await cms.media.get(args.params['id']!);
            if (record === undefined) throw new CmsHttpError(404, { detail: `No media item '${args.params['id']}'.` });
            const query = args.query as z.output<typeof ImageQuerySchema>;
            const rendered = await cms.media.render(record, {
                crop: query.crop,
                focalPoint: query.focal,
                width: query.w,
                height: query.h,
            });
            if (rendered === undefined)
                throw new CmsHttpError(404, { detail: `The file of '${args.params['id']}' is missing from storage.` });
            return {
                status: 200,
                body: rendered,
            };
        }) as never
    );

    const updateMedia = route({
        method: 'PATCH',
        path: `${editingBase}/media/:id`,
        auth: editor,
        summary: 'Set the alt text or focal point of a media item',
        tool: true,
        pathParams: z.object({
            id: z.string(),
        }),
        body: UpdateMediaBodySchema,
        responses: {
            200: MediaSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const record = await cms.media.update(
                args.params['id']!,
                args.body as z.output<typeof UpdateMediaBodySchema>,
                authorOf(cms, args)
            );
            if (record === undefined) throw new CmsHttpError(404, { detail: `No media item '${args.params['id']}'.` });
            return {
                status: 200,
                body: withUrl(cms, record),
            };
        }) as never
    );

    const createUpload = route({
        method: 'POST',
        path: `${editingBase}/media/uploads`,
        auth: editor,
        summary: 'Start an upload: a presigned URL the browser sends the file to',
        body: CreateUploadBodySchema,
        responses: {
            201: UploadSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => ({
            status: 201,
            body: await cms.media.createUpload(args.body as z.output<typeof CreateUploadBodySchema>),
        })) as never
    );

    const completeUpload = route({
        method: 'POST',
        path: `${editingBase}/media/uploads/:uploadId`,
        auth: editor,
        summary: 'Finish an upload: check the file and create the media item',
        pathParams: z.object({
            uploadId: z.string(),
        }),
        responses: {
            201: MediaSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const record = await cms.media.completeUpload(args.params['uploadId']!, authorOf(cms, args));
            return {
                status: 201,
                body: withUrl(cms, record),
            };
        }) as never
    );

    const searchItems = route({
        method: 'GET',
        path: `${editingBase}/items/:brand`,
        auth: editor,
        summary: 'Find the ids a branded field may hold, by brand and an optional search term',
        description:
            "A collection's brand lists its items, and a relationship's brand lists what its options answer. Each result has the id to store and a label to show.",
        tool: true,
        pathParams: z.object({
            brand: z.string(),
        }),
        query: z.object({
            q: z.string().optional(),
            ids: z.array(z.string()).optional().describe('Name these ids instead of searching.'),
        }),
        responses: {
            200: z.object({
                items: z.array(
                    z.object({
                        id: z.string(),
                        label: z.string(),
                        image: z.string().optional(),
                    })
                ),
            }),
            404: ProblemDetailsSchema,
            502: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => ({
            status: 200,
            body: {
                items: await cms.searchItems(args.params['brand']!, searchInput(args)),
            },
        })) as never
    );

    const invalidate = route({
        method: 'POST',
        path: `${base}/invalidate`,
        auth: options.auth.invalidate ?? editor,
        summary: 'Refresh every page that shows one item of a relationship',
        description:
            'For the app API: call it when a product, a person or anything else pages hold by id changes, so the pages showing it render fresh. Answers with the pages it refreshed.',
        body: InvalidateBodySchema,
        responses: {
            200: z.object({
                pages: z.array(z.string()),
            }),
        },
    }).handler(
        guarded(async (cms, args) => {
            const body = args.body as z.output<typeof InvalidateBodySchema>;
            return {
                status: 200,
                body: {
                    pages: await cms.invalidateRelationship(body.relationship, body.id),
                },
            };
        }) as never
    );

    return {
        content: {
            pages: pageReads,
            ...(namedSites.length === 0
                ? {}
                : {
                      sites: siteReads,
                  }),
            globals: globalReads,
            collections: collectionReads,
            media: {
                image: getImage,
            },
        },
        editing: {
            describe,
            pages: {
                list: listPages,
                ...editingRoutes(pageScope),
            },
            ...(namedSites.length === 0
                ? {}
                : {
                      sites: {
                          pages: editingRoutes(sitePageScope),
                      },
                  }),
            globals: editingRoutes(globalScope),
            collections: {
                ...itemRoutes(),
                ...editingRoutes(itemScope),
            },
            media: {
                list: listMedia,
                get: getMedia,
                getFile: getMediaFile,
                update: updateMedia,
                createUpload,
                completeUpload,
            },
            whereUsed,
            searchItems,
        },
        invalidate,
    };
};

export type CmsRoutes = ReturnType<typeof cmsRoutes>;
