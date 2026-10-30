import { z } from 'zod';
import { route, type PluginDeclaration } from 'kizunajs/plugin';
import { BinarySchema, ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import type { RouteAuth } from 'kizunajs';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { addressOf, CmsHttpError, fieldOnSite, previewPathOf, type CmsService, type DraftState } from './cms.js';
import { DEFAULT_SITE, routePrefix, sitesOf, type CmsPluginOptions, type PageMap } from './options.js';
import type { Collection, ContentDefinition, Global } from './definitions.js';
import { dataFields } from './field.js';
import { servesCollection } from './page.js';
import { addressFieldsOf } from './dynamic.js';
import { formatRef, parseRef, type DocumentRef } from './refs.js';
import { resolvedSchema } from './content-schema.js';
import { getAtPath } from './content.js';
import { documentViewFor } from './document-view.js';
import { PREVIEW_TTL_SECONDS } from './preview-token.js';
import { previewProxyUrl } from './preview-proxy.js';
import {
    CreateItemBodySchema,
    CreateUploadBodySchema,
    DescribedPageSchema,
    DraftChangesSchema,
    RevertBodySchema,
    DraftHeadersSchema,
    DraftPageSchema,
    EditorItemSchema,
    TreePlacementShape,
    MediaListSchema,
    MediaSchema,
    MediaUsesSchema,
    MissingFieldsSchema,
    PageSummarySchema,
    PublishBodySchema,
    UnpublishBodySchema,
    RollbackBodySchema,
    StoredContentSchema,
    UpdateDraftBodySchema,
    UpdateDraftHeadersSchema,
    UpdateMediaBodySchema,
    UploadSchema,
    VersionListSchema,
    VersionContentSchema,
    PageStatusSchema,
    PeopleSchema,
    OwnerBodySchema,
    RequestReviewBodySchema,
    DecideReviewBodySchema,
    ReviewIdsBodySchema,
    CommentBodySchema,
    ReviewStateSchema,
    WaitingReviewsSchema,
    ReviewListSchema,
    WhereUsedSchema,
} from './wire.js';
import { UploadRejectedError } from './media/media.js';
import { parseFields, parseFilter } from './item-list.js';
import { ImageQuerySchema, InvalidateBodySchema } from './wire.js';
import { sameContent } from './same-content.js';
import {
    assertReviewed,
    commentOnReview,
    decideReviews,
    documentLabel,
    mayPublishPastReview,
    peopleFor,
    peopleOf,
    recordPublishedPast,
    reopenReviews,
    requestReviews,
    resolveComment,
    reviewOf,
    setOwner,
    versionReviewsOf,
    waitingReviews,
    withdrawReviews,
} from './reviews.js';
import type { Person } from './options.js';
import { collectionActionRoutes, itemActions } from './action-routes.js';
import { listViewsRoute, viewRoutes } from './view-routes.js';
import { dashboardRoute } from './dashboard-routes.js';
import type { EditorAccess } from './site-access.js';

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
 * What editors call a field: its label, or its name written out.
 */
const labelOf = (field: { label?: string; name: string }): string =>
    field.label ??
    field.name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

/**
 * Who looks after a document, and where its review stands, as `describe` and
 * the changes list answer them.
 */
const reviewFields = async (cms: CmsService, state: DraftState, people?: readonly Person[]) => {
    const everyone = people ?? (await peopleOf(cms));
    const owner = state.row?.owner === null || state.row?.owner === undefined ? undefined : state.row.owner;
    const person = owner === undefined ? undefined : everyone.find((candidate) => candidate.id === owner);
    return {
        owner:
            owner === undefined
                ? null
                : {
                      id: owner,
                      name: person?.name ?? owner,
                      ...(person?.image === undefined
                          ? {}
                          : {
                                image: person.image,
                            }),
                  },
        review: await reviewOf(cms, state, everyone),
        requireReview: state.target.definition.requireReview === true,
    };
};

/**
 * The shared document a site's values apply to, as its draft stands, for the
 * values to show it in place of their own.
 */
const sharedContentOf = async (cms: CmsService, state: DraftState): Promise<Record<string, unknown> | null> => {
    if (state.target.shared === undefined) return null;
    const shared = await cms.draftState(state.target.shared);
    return shared.row?.draft ?? shared.row?.published ?? null;
};

/**
 * What a draft changes from what is published: one entry per field shown in
 * the editor, the fields of a block counted one by one.
 */
const draftChanges = async (cms: CmsService, ref: DocumentRef, access: EditorAccess) => {
    const caller = access.callerFor(ref);
    const canPublish = cms.mayPublish(access, ref);
    const state = await cms.draftState(ref);
    const draft = state.row?.draft ?? state.row?.published ?? null;
    const published = (await cms.publishedAsStored(ref))?.content;
    const fields = cms.describe(ref, draft, caller);
    const differs = (path: string): boolean => !sameContent(getAtPath(published, path), getAtPath(draft, path));
    const changes = [];
    for (const field of fields.filter((candidate) => candidate.parent === undefined)) {
        const children = fields.filter((candidate) => candidate.parent === field.path);
        for (const changed of (children.length === 0 ? [field] : children).filter((candidate) => differs(candidate.path))) {
            const before = getAtPath(published, changed.path);
            const after = getAtPath(draft, changed.path);
            changes.push({
                path: changed.path,
                label: children.length === 0 ? labelOf(changed) : `${labelOf(field)} › ${labelOf(changed)}`,
                ...(before === undefined
                    ? {}
                    : {
                          before,
                      }),
                ...(after === undefined
                    ? {}
                    : {
                          after,
                      }),
                writable: changed.writable,
            });
        }
    }
    return {
        ref: formatRef(ref),
        label: documentLabel(state),
        path: cms.addressOf(state.target, draft) ?? null,
        published: published !== undefined,
        changes,
        ...(await reviewFields(cms, state)),
        canPublish,
        canPublishPastReview: canPublish && mayPublishPastReview(cms, caller.role),
    };
};

/**
 * Refuses to publish, unpublish or delete shared content for an editor who
 * is no admin over every site, since every site shows it.
 */
const assertPublishes = (cms: CmsService, access: EditorAccess, ref: DocumentRef): void => {
    if (cms.mayPublish(access, ref)) return;
    throw new CmsHttpError(403, {
        detail: `'${formatRef(ref)}' is shared, and every site shows it, so an admin over every site publishes it. Ask one to review it.`,
    });
};

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

/**
 * A definition's schema as one site reads it, without the fields whose
 * `sites` name others.
 */
const schemaOnSite = (definition: ContentDefinition, site: string): z.ZodType => {
    const left = dataFields(definition.fields).filter((field) => !fieldOnSite(field, site));
    if (left.length === 0) return definition.schema;
    const names = left.map((field) => field.name);
    return z.object(Object.fromEntries(Object.entries((definition.schema as z.ZodObject).shape).filter(([name]) => !names.includes(name))));
};

/**
 * The `site` a media route takes, naming the library it works in.
 */
const MediaSiteQuery = z
    .string()
    .optional()
    .describe('The site whose own images to list, upload to or change. Leave it out for the shared images, which shared content holds.');

const mediaSiteOf = (args: Args): string | undefined => {
    const site = (args.query as { site?: unknown } | undefined)?.site;
    return typeof site === 'string' ? site : undefined;
};

const listQueryOf = (definition: ContentDefinition, indexes: readonly string[]) => {
    const shape: Record<string, z.ZodType> = {};
    for (const index of indexes) {
        const field = dataFields(definition.fields).find((candidate) => candidate.name === index)!;
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

    // One view for every route that opens the editor, so MCP serves it once.
    const documentView = documentViewFor(options);

    const withUrl = (cms: CmsService, record: Awaited<ReturnType<CmsService['media']['get']>> & object) => ({
        ...record,
        url: cms.imageUrl(record.id),
    });

    const editingRoutes = (scope: Scope) => {
        const refOf = (cms: CmsService, args: Args): DocumentRef => cms.access(args.auth).assertSeesRef(scope.refOf(args.params));
        return {
            getDraft: route({
                method: 'GET',
                path: `${editingBase}${scope.prefix}/draft`,
                auth: editor,
                summary: `Read the draft of ${scope.noun}`,
                tool: {
                    ui: documentView,
                },
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
                    const state = await cms.draftState(refOf(cms, args));
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
                    const ref = refOf(cms, args);
                    const state = await cms.update({
                        ref,
                        changes: body.changes,
                        caller: cms.access(args.auth).callerFor(ref),
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
                    const ref = refOf(cms, args);
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
                    const ref = refOf(cms, args);
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
                    const ref = refOf(cms, args);
                    const versions = await cms.history(ref);
                    const reviews = await versionReviewsOf(cms, ref);
                    return {
                        status: 200,
                        body: {
                            name: nameOf(ref),
                            versions: versions.map((version) => ({
                                ...version,
                                review: reviews.get(version.version) ?? null,
                            })),
                        },
                    };
                }) as never
            ),

            getVersion: route({
                method: 'GET',
                path: `${editingBase}${scope.prefix}/versions/:version`,
                auth: editor,
                summary: `Read one earlier version of ${scope.noun}`,
                description: 'The content as it was saved in that version, to compare with the draft or decide what to restore.',
                tool: true,
                pathParams: scope.params.extend({
                    version: z.coerce.number().int().min(1),
                }),
                responses: {
                    200: VersionContentSchema,
                    404: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    const ref = refOf(cms, args);
                    const version = Number(args.params['version']);
                    const found = await cms.versionContent(ref, version);
                    return {
                        status: 200,
                        body: {
                            ref: formatRef(ref),
                            version,
                            summary: found.summary,
                            createdAt: found.createdAt.toISOString(),
                            createdBy: found.createdBy,
                            content: found.content,
                        },
                    };
                }) as never
            ),

            changes: route({
                method: 'GET',
                path: `${editingBase}${scope.prefix}/changes`,
                auth: editor,
                summary: `List what the draft of ${scope.noun} changes from what is published`,
                description:
                    'Each changed field with what visitors see now and what publishing makes them see. Read it before publishing, so the person knows what goes live.',
                tool: true,
                pathParams: scope.params,
                responses: {
                    200: {
                        body: DraftChangesSchema,
                        cache: 'no-store',
                    },
                    404: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    const ref = refOf(cms, args);
                    return {
                        status: 200,
                        body: await draftChanges(cms, ref, cms.access(args.auth)),
                    };
                }) as never
            ),

            revert: route({
                method: 'POST',
                path: `${editingBase}${scope.prefix}/revert`,
                auth: editor,
                summary: `Set fields of the draft of ${scope.noun} back to what is published`,
                description: 'Undoes the draft changes to the fields named, from the changes list. Nothing is published by this.',
                tool:
                    scope.approveWrites === true
                        ? {
                              needsApproval: true,
                          }
                        : true,
                pathParams: scope.params,
                body: RevertBodySchema,
                responses: {
                    200: DraftPageSchema,
                    404: ProblemDetailsSchema,
                    422: ValidationErrorSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    const ref = refOf(cms, args);
                    const paths = (args.body as z.output<typeof RevertBodySchema>).paths;
                    const published = (await cms.publishedAsStored(ref))?.content;
                    const changes = Object.fromEntries(paths.map((path) => [path, getAtPath(published, path)]));
                    const state = await cms.update({
                        ref,
                        changes,
                        caller: cms.access(args.auth).callerFor(ref),
                        author: authorOf(cms, args),
                        summary: paths.length === 1 ? `Reverted ${paths[0]}` : `Reverted ${paths.length} changes`,
                    });
                    return {
                        status: 200,
                        body: draftBody(state),
                    };
                }) as never
            ),

            publish: route({
                method: 'POST',
                path: `${editingBase}${scope.prefix}/publish`,
                auth: editor,
                summary: `Publish the draft of ${scope.noun}`,
                description:
                    'Makes the current draft what every visitor sees. The person confirms before this runs: in a host that cannot ask, such as Claude, they press Publish in the editor instead. Someone with a role under `reviews.roles` may pass `force` to publish before the review is approved.',
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
                guarded(async (cms, args) => {
                    const ref = refOf(cms, args);
                    const body = args.body as z.output<typeof PublishBodySchema>;
                    const access = cms.access(args.auth);
                    assertPublishes(cms, access, ref);
                    const state = await cms.draftState(ref);
                    const past = await assertReviewed(cms, state, {
                        force: body?.force === true,
                        role: access.callerFor(ref).role,
                    });
                    const published = await cms.publish(ref, authorOf(cms, args));
                    if (past !== undefined) await recordPublishedPast(cms, state, past, authorOf(cms, args));
                    return {
                        status: 200,
                        body: draftBody(published),
                    };
                }) as never
            ),

            unpublish: route({
                method: 'POST',
                path: `${editingBase}${scope.prefix}/unpublish`,
                auth: editor,
                summary: `Unpublish ${scope.noun}`,
                description:
                    'Withdraws the published copy, so visitors stop seeing it and the site drops it. The draft and every version stay, and publishing again brings it back. The person confirms before this runs.',
                tool: {
                    needsApproval: true,
                    destructiveHint: true,
                    idempotentHint: true,
                },
                pathParams: scope.params,
                body: UnpublishBodySchema,
                responses: {
                    200: DraftPageSchema,
                    404: ProblemDetailsSchema,
                    409: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    const ref = refOf(cms, args);
                    assertPublishes(cms, cms.access(args.auth), ref);
                    return {
                        status: 200,
                        body: draftBody(await cms.unpublish(ref, authorOf(cms, args))),
                    };
                }) as never
            ),

            setOwner: route({
                method: 'PUT',
                path: `${editingBase}${scope.prefix}/owner`,
                auth: editor,
                summary: `Name the person who looks after ${scope.noun}`,
                description: 'The owner is suggested first when someone asks for a review. Pass null for nobody.',
                tool: true,
                pathParams: scope.params,
                body: OwnerBodySchema,
                responses: {
                    204: z.void(),
                    404: ProblemDetailsSchema,
                    409: ProblemDetailsSchema,
                    422: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    await setOwner(cms, refOf(cms, args), (args.body as z.output<typeof OwnerBodySchema>).owner, cms.access(args.auth));
                    return {
                        status: 204,
                    };
                }) as never
            ),

            rollback: route({
                method: 'POST',
                path: `${editingBase}${scope.prefix}/rollback`,
                auth: editor,
                summary: `Restore an earlier version of ${scope.noun} as a new draft`,
                description: 'Nothing is published by this. The restored content becomes the draft, which is published separately.',
                tool:
                    scope.approveWrites === true
                        ? {
                              needsApproval: true,
                              destructiveHint: false,
                          }
                        : {
                              destructiveHint: false,
                          },
                pathParams: scope.params,
                body: RollbackBodySchema,
                responses: {
                    200: DraftPageSchema,
                    404: ProblemDetailsSchema,
                    409: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => ({
                    status: 200,
                    body: draftBody(
                        await cms.rollback(
                            refOf(cms, args),
                            (args.body as z.output<typeof RollbackBodySchema>).version,
                            authorOf(cms, args)
                        )
                    ),
                })) as never
            ),
        };
    };

    const reader = options.auth.read;
    const readAuth: RouteAuth = reader ?? false;
    // A read that needs a token answers that one caller, so no shared cache may keep it.
    const readCache = (
        reader === undefined
            ? {
                  etag: true,
                  cache: {
                      scope: 'public',
                      maxAge: 0,
                      staleWhileRevalidate: 60,
                  },
              }
            : {
                  etag: true,
                  cache: {
                      scope: 'private',
                      maxAge: 0,
                  },
              }
    ) as never;

    /**
     * Refuses a partner's token a site outside its `reads`. A reader whose
     * guard names no partner reads every site.
     */
    const assertReads = (args: Args, site: string | undefined): void => {
        if (reader === undefined) return;
        const partner = args.auth?.[reader]?.['partner'];
        if (partner === undefined) return;
        const reads = typeof partner === 'string' ? options.partners?.[partner]?.reads : undefined;
        if (reads === undefined) {
            throw new CmsHttpError(403, {
                detail: `Forbidden: the token names the partner '${String(partner)}', which cms() does not declare.`,
            });
        }
        if (site === undefined || site === DEFAULT_SITE || reads.includes(site)) return;
        throw new CmsHttpError(403, {
            detail: `Forbidden: this route requires content.sites.${site}:read, and the ${partner} partner reads ${reads.length === 0 ? 'no site' : reads.join(', ')}.`,
        });
    };

    /**
     * The public list and get of a collection's items.
     */
    const listingReads = (input: {
        definition: ContentDefinition;
        indexes: readonly string[];
        path: `/${string}`;
        collection: string;
        /**
         * Where the items are stored: the default site for a shared
         * collection, the site for its own.
         */
        site: string;
        /**
         * The site the items are read on.
         */
        readingSite: string;
        refOf: (id: string) => DocumentRef;
        plural: string;
        single: string;
    }) => {
        const item = (resolvedSchema(schemaOnSite(input.definition, input.readingSite)) as z.ZodObject).extend({
            id: z.string(),
        });
        return {
            list: route({
                method: 'GET',
                path: input.path,
                auth: readAuth,
                summary: `List the published ${input.plural}`,
                query: listQueryOf(input.definition, input.indexes),
                responses: {
                    200: {
                        body: z.object({
                            items: z.array(item),
                            next: z.string().nullable(),
                        }),
                        ...(readCache as object),
                    },
                    400: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    assertReads(args, input.readingSite);
                    const { orderBy, direction, limit, cursor, ...where } = (args.query ?? {}) as Record<string, unknown>;
                    const result = await cms.listItems(
                        input.collection,
                        {
                            draft: false,
                            where: Object.fromEntries(Object.entries(where).filter(([, value]) => value !== undefined)),
                            ...(typeof orderBy === 'string' ? { orderBy } : {}),
                            ...(direction === 'asc' || direction === 'desc' ? { direction } : {}),
                            ...(typeof limit === 'number' ? { limit } : {}),
                            ...(typeof cursor === 'string' ? { cursor } : {}),
                        },
                        input.site,
                        input.readingSite
                    );
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
                auth: readAuth,
                summary: `Read one published ${input.single}`,
                pathParams: z.object({
                    id: z.string(),
                }),
                responses: {
                    200: {
                        body: item,
                        ...(readCache as object),
                    },
                    404: ProblemDetailsSchema,
                },
            }).handler(
                guarded(async (cms, args) => {
                    assertReads(args, input.readingSite);
                    const published = await cms.publishedOn(input.refOf(args.params['id']!), input.readingSite);
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
                        auth: readAuth,
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
                                ...(readCache as object),
                            },
                            404: ProblemDetailsSchema,
                        },
                    }).handler(
                        guarded(async (cms, args) => {
                            assertReads(args, site);
                            const published = await cms.publishedOn(
                                {
                                    type: 'page',
                                    name,
                                    ...(site === DEFAULT_SITE
                                        ? {}
                                        : {
                                              site,
                                          }),
                                },
                                site
                            );
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
    const siteEntries = Object.entries(options.sites?.entries ?? {});

    /**
     * The public read of a global, read on a site.
     */
    const globalRead = (definition: Global, ref: DocumentRef, path: `/${string}`, site: string) =>
        route({
            method: 'GET',
            path,
            auth: readAuth,
            summary:
                site === DEFAULT_SITE
                    ? `Read the published ${words(definition.name)} global`
                    : `Read the published ${words(definition.name)} global on the ${site} site`,
            responses: {
                200: {
                    body: z.object({
                        version: z.int(),
                        updatedAt: z.string(),
                        content: resolvedSchema(schemaOnSite(definition, site)),
                    }),
                    ...(readCache as object),
                },
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                assertReads(args, site);
                const published = await cms.publishedOn(ref, site);
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
        );

    /**
     * The public reads of the globals a site shows: the shared ones, and the
     * site's own.
     */
    const globalReadsOf = (site: string, prefix: `/${string}`) =>
        Object.fromEntries([
            ...(options.globals ?? []).map((definition) => [
                definition.name,
                globalRead(
                    definition,
                    {
                        type: 'global',
                        name: definition.name,
                    },
                    `${prefix}/globals/${definition.name}`,
                    site
                ),
            ]),
            ...(options.sites?.entries[site]?.globals ?? []).map((definition) => [
                definition.name,
                globalRead(
                    definition,
                    {
                        type: 'global',
                        name: definition.name,
                        site,
                    },
                    `${prefix}/globals/${definition.name}`,
                    site
                ),
            ]),
        ]);

    /**
     * The fields a collection's lists filter and sort by: those the given
     * pages' addresses read, then its `indexes`.
     */
    const indexesOf = (definition: Collection, pageMaps: readonly PageMap[]): string[] => [
        ...new Set([
            // A param naming no field is refused when the config assembles, with the field it lacks.
            ...pageMaps
                .flatMap((pages) => addressFieldsOf(definition.name, pages))
                .filter((field) => dataFields(definition.fields).some((candidate) => candidate.name === field)),
            ...(definition.indexes ?? []),
        ]),
    ];
    const everySitesPages = Object.values(sites).map((declared) => declared.pages);

    /**
     * The public reads of the collections a site shows: the shared ones, and
     * the site's own.
     */
    const collectionReadsOf = (site: string, prefix: `/${string}`) =>
        Object.fromEntries([
            ...(options.collections ?? []).map((definition) => [
                definition.name,
                listingReads({
                    definition,
                    indexes: indexesOf(definition, everySitesPages),
                    path: `${prefix}/collections/${definition.name}`,
                    collection: definition.name,
                    site: DEFAULT_SITE,
                    readingSite: site,
                    refOf: (id) => ({
                        type: 'item',
                        collection: definition.name,
                        id,
                    }),
                    plural: words(definition.name),
                    single: `item of ${words(definition.name)}`,
                }),
            ]),
            ...(options.sites?.entries[site]?.collections ?? []).map((definition) => [
                definition.name,
                listingReads({
                    definition,
                    indexes: indexesOf(definition, [sites[site]?.pages ?? {}]),
                    path: `${prefix}/collections/${definition.name}`,
                    collection: definition.name,
                    site,
                    readingSite: site,
                    refOf: (id) => ({
                        type: 'item',
                        collection: definition.name,
                        id,
                        site,
                    }),
                    plural: words(definition.name),
                    single: `item of ${words(definition.name)}`,
                }),
            ]),
        ]);

    const contentReads: Record<string, ReturnType<typeof pageReadsOf>> = siteEntries.length === 0
        ? {
              pages: pageReadsOf(sites[DEFAULT_SITE]?.pages ?? {}, DEFAULT_SITE),
              globals: globalReadsOf(DEFAULT_SITE, `${base}/content`),
              collections: collectionReadsOf(DEFAULT_SITE, `${base}/content`),
          }
        : {
              sites: Object.fromEntries(
                  siteEntries.map(([site]) => [
                      site,
                      {
                          pages: pageReadsOf(sites[site]?.pages ?? {}, site),
                          globals: globalReadsOf(site, `${base}/content/sites/${site}`),
                          collections: collectionReadsOf(site, `${base}/content/sites/${site}`),
                      },
                  ])
              ) as never,
          };

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
    const listedCollections = (options.collections ?? [])
        .map((definition) => {
            const indexes = indexesOf(definition, everySitesPages);
            const columns = (definition.columns ?? []).filter((column) => !indexes.includes(column));
            return `${definition.name} filters and sorts by ${indexes.length === 0 ? 'no field' : indexes.join(', ')}${columns.length === 0 ? '' : `, and also shows ${columns.join(', ')}`}.`;
        })
        .join(' ');
    /**
     * Where routes for shared content sit, or for one site's own.
     */
    interface SiteAt {
        prefix: '' | '/sites/:site';
        params: z.ZodObject;
        siteOf: (params: Record<string, string>) => string;
    }
    const shared: SiteAt = {
        prefix: '',
        params: z.object({}),
        siteOf: () => DEFAULT_SITE,
    };
    const onSite: SiteAt = {
        prefix: '/sites/:site',
        params: z.object({
            site: z.string(),
        }),
        siteOf: (params) => params['site']!,
    };

    /**
     * The site a route's params name, refused when the editor may not open it.
     */
    const siteOf = (cms: CmsService, args: Args, at: SiteAt): string => {
        const site = at.siteOf(args.params);
        cms.access(args.auth).assertSees(site);
        return site;
    };

    const itemRoutes = (at: SiteAt) => ({
        list: route({
            method: 'GET',
            path: `${editingBase}${at.prefix}/collections`,
            auth: editor,
            summary:
                at.prefix === ''
                    ? 'List every collection, with how many items it holds'
                    : "List a site's own collections, with how many items each holds",
            tool: true,
            ...(at.prefix === ''
                ? {}
                : {
                      pathParams: at.params,
                  }),
            responses: {
                200: {
                    body: z.object({
                        collections: z.array(
                            z.object({
                                name: z.string(),
                                label: z.string(),
                                count: z.int(),
                            })
                        ),
                    }),
                    cache: 'no-store',
                },
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 200,
                body: {
                    collections: await cms.collectionSummaries(siteOf(cms, args, at)),
                },
            })) as never
        ),

        listItems: route({
            method: 'GET',
            path: `${editingBase}${at.prefix}/collections/:name/items`,
            auth: editor,
            summary: 'List every item of a collection, drafts included, with its status and address',
            tool: true,
            pathParams: at.params.extend({
                name: z.string(),
            }),
            description: `Pages with \`limit\` and \`offset\`, and counts every item that matches as \`total\`. ${listedCollections}`,
            query: z.object({
                q: z.string().optional().describe('Keep the items whose title or address holds this text, in any case.'),
                filter: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Conditions, each `field:operator:value`, like `topic:is:care`. `field` is `status` (empty, draft, changed or published) or a field of the collection's indexes. `operator` is `is` or `isNot`, which also find the value in a list of ids, or for ids of a collection with a tree `within` or `outside`, which take in every item under the value. The conditions all hold together, and an `or` entry between them starts another set that may hold instead."
                    ),
                orderBy: z
                    .string()
                    .optional()
                    .describe("`title`, `status`, `updatedAt` or a field of the collection's indexes. `title` when left out."),
                direction: z.enum(['asc', 'desc']).optional().describe('Ascending when left out, newest first for `updatedAt`.'),
                limit: z.int().min(1).max(200).optional().describe('How many items a page holds. Without it, every item that matches.'),
                offset: z.int().min(0).optional().describe('How many matching items to skip, for the pages after the first.'),
                fields: z
                    .array(z.string())
                    .optional()
                    .describe(
                        "Fields of the collection's indexes and columns each item carries under `values`, with `labels` for a choice or an id. A name or several joined by commas, like `topic,author`."
                    ),
            }),
            responses: {
                200: z.object({
                    items: z.array(EditorItemSchema),
                    total: z.int().describe('How many items match, on every page together.'),
                }),
                400: ProblemDetailsSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const { q, filter, orderBy, direction, limit, offset, fields } = (args.query ?? {}) as {
                    q?: string;
                    filter?: string[];
                    orderBy?: string;
                    direction?: 'asc' | 'desc';
                    limit?: number;
                    offset?: number;
                    fields?: string[];
                };
                const parsed = parseFilter(filter ?? []);
                if ('problem' in parsed) {
                    throw new CmsHttpError(400, {
                        detail: parsed.problem,
                    });
                }
                const listed = await cms.editorList(
                    args.params['name']!,
                    {
                        groups: parsed.groups,
                        fields: parseFields(fields ?? []),
                        headers: forwardedHeaders(args),
                        ...(q === undefined
                            ? {}
                            : {
                                  search: q,
                              }),
                        ...(orderBy === undefined
                            ? {}
                            : {
                                  orderBy,
                              }),
                        ...(direction === undefined
                            ? {}
                            : {
                                  direction,
                              }),
                        ...(limit === undefined
                            ? {}
                            : {
                                  limit,
                              }),
                        ...(offset === undefined
                            ? {}
                            : {
                                  offset,
                              }),
                    },
                    siteOf(cms, args, at)
                );
                return {
                    status: 200,
                    body: listed,
                };
            }) as never
        ),

        createItem: route({
            method: 'POST',
            path: `${editingBase}${at.prefix}/collections/:name/items`,
            auth: editor,
            summary: 'Add an item to a collection, as a draft',
            tool: true,
            pathParams: at.params.extend({
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
                        cms.access(args.auth).callerOn(siteOf(cms, args, at)),
                        authorOf(cms, args),
                        siteOf(cms, args, at)
                    )
                ),
            })) as never
        ),

        deleteItem: route({
            method: 'DELETE',
            path: `${editingBase}${at.prefix}/collections/:name/items/:id`,
            auth: editor,
            summary: 'Delete an item of a collection, with its history',
            description: 'Its address stops answering, and pages that reference it stop showing it. The person confirms before this runs.',
            tool: {
                needsApproval: true,
            },
            pathParams: at.params.extend({
                name: z.string(),
                id: z.string(),
            }),
            responses: {
                204: z.void(),
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const site = siteOf(cms, args, at);
                assertPublishes(cms, cms.access(args.auth), cms.listing(args.params['name']!, site).refOf(args.params['id']!));
                await cms.deleteItem(args.params['name']!, args.params['id']!, site);
                return {
                    status: 204,
                    body: undefined,
                };
            }) as never
        ),
    });

    const siteGlobalScope: Scope = {
        prefix: '/sites/:site/globals/:name',
        params: z.object({
            site: z.string(),
            name: z.string(),
        }),
        refOf: (params) => ({
            type: 'global',
            name: params['name']!,
            site: params['site']!,
        }),
        noun: "a site's own global",
        approveWrites: true,
    };
    const siteItemScope: Scope = {
        prefix: '/sites/:site/collections/:name/items/:id',
        params: z.object({
            site: z.string(),
            name: z.string(),
            id: z.string(),
        }),
        refOf: (params) => ({
            type: 'item',
            collection: params['name']!,
            id: params['id']!,
            site: params['site']!,
        }),
        noun: "an item of a site's own collection",
    };
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

    const listPeople = route({
        method: 'GET',
        path: `${editingBase}/people`,
        auth: editor,
        summary: 'List the people who edit, to name an owner or ask someone for a review',
        description: 'With sites, the people who share a site with you, and the admins over every site.',
        tool: true,
        responses: {
            200: {
                body: PeopleSchema,
                cache: 'no-store',
            },
        },
    }).handler(
        guarded(async (cms, args) => ({
            status: 200,
            body: {
                me: authorOf(cms, args),
                people: (await peopleFor(cms, cms.access(args.auth))).map((person) => ({
                    id: person.id,
                    name: person.name,
                    ...(person.email === undefined
                        ? {}
                        : {
                              email: person.email,
                          }),
                    ...(person.image === undefined
                        ? {}
                        : {
                              image: person.image,
                          }),
                    ...(person.roles === undefined
                        ? {}
                        : {
                              roles: [...person.roles],
                          }),
                })),
            },
        })) as never
    );

    /**
     * Refuses reviews of documents on a site the editor may not open, as if
     * there were none, and hands back their access.
     */
    const seenReviews = async (cms: CmsService, args: Args, ids: readonly string[]): Promise<EditorAccess> => {
        const access = cms.access(args.auth);
        for (const review of await cms.store.reviews(ids)) {
            if (!access.seesRef(review.ref)) throw new CmsHttpError(404, { detail: `No review '${review.id}'.` });
        }
        return access;
    };

    const listReviews = route({
        method: 'GET',
        path: `${editingBase}/reviews`,
        auth: editor,
        summary: 'List the reviews waiting for an answer, for you or for anyone',
        tool: {
            readOnlyHint: true,
        },
        query: z.object({
            for: z.enum(['me', 'anyone']).default('me').describe('`me` lists the reviews you were asked for.'),
        }),
        responses: {
            200: {
                body: WaitingReviewsSchema,
                cache: 'no-store',
            },
        },
    }).handler(
        guarded(async (cms, args) => {
            const query = (args.query ?? {}) as { for?: 'me' | 'anyone' };
            return {
                status: 200,
                body: {
                    reviews: await waitingReviews(cms, query.for === 'anyone' ? undefined : authorOf(cms, args), (ref) =>
                        cms.access(args.auth).seesRef(ref)
                    ),
                },
            };
        }) as never
    );

    const requestReview = route({
        method: 'POST',
        path: `${editingBase}/reviews`,
        auth: editor,
        summary: 'Ask people to review the drafts of one or more documents before they go live',
        description:
            'Each reviewer sees the request in the editor and when they ask what is waiting for them. Name reviewers by their id from the people list, and suggest the owner first. Comments on single fields from an earlier review of the same draft stay.',
        tool: true,
        body: RequestReviewBodySchema,
        responses: {
            201: ReviewListSchema,
            400: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const body = args.body as z.output<typeof RequestReviewBodySchema>;
            const access = cms.access(args.auth);
            for (const ref of body.refs) {
                const parsed = parseRef(ref);
                if (parsed !== undefined) access.assertSeesRef(parsed);
            }
            return {
                status: 201,
                body: {
                    reviews: await requestReviews(cms, {
                        access,
                        refs: body.refs,
                        reviewers: body.reviewers,
                        note: body.note ?? null,
                        by: authorOf(cms, args),
                    }),
                },
            };
        }) as never
    );

    const decideReview = route({
        method: 'POST',
        path: `${editingBase}/reviews/decide`,
        auth: editor,
        summary: 'Approve reviews, or send them back with changes to make',
        description:
            "An approval is the person's own judgement of what goes live, so they confirm first: in a host that cannot ask, such as Claude, they answer in the editor instead. An approval can be undone until the draft is published, with the reopen route.",
        tool: {
            needsApproval: true,
            destructiveHint: false,
        },
        body: DecideReviewBodySchema,
        responses: {
            200: ReviewListSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const body = args.body as z.output<typeof DecideReviewBodySchema>;
            const access = await seenReviews(cms, args, body.ids);
            return {
                status: 200,
                body: {
                    reviews: await decideReviews(cms, {
                        ids: body.ids,
                        decision: body.decision,
                        note: body.note ?? null,
                        by: authorOf(cms, args),
                        roleOn: (ref) => access.callerFor(ref).role,
                    }),
                },
            };
        }) as never
    );

    const withdrawReview = route({
        method: 'POST',
        path: `${editingBase}/reviews/withdraw`,
        auth: editor,
        summary: 'Withdraw reviews you asked for that still wait for an answer',
        description:
            'Nobody is asked any more, and the document reads as if no review was asked for. Only the person who asked may withdraw a review, and only while it waits.',
        tool: {
            destructiveHint: false,
            idempotentHint: true,
        },
        body: ReviewIdsBodySchema,
        responses: {
            200: ReviewListSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const body = args.body as z.output<typeof ReviewIdsBodySchema>;
            await seenReviews(cms, args, body.ids);
            return {
                status: 200,
                body: {
                    reviews: await withdrawReviews(cms, {
                        ids: body.ids,
                        by: authorOf(cms, args),
                    }),
                },
            };
        }) as never
    );

    const reopenReview = route({
        method: 'POST',
        path: `${editingBase}/reviews/reopen`,
        auth: editor,
        summary: 'Undo your approval of reviews whose drafts are not published yet',
        description:
            'Each review waits for an answer again, and a document that requires a review stops publishing until someone approves it. Only the person who approved may undo it, and only before the draft goes live.',
        tool: {
            destructiveHint: false,
            idempotentHint: true,
        },
        body: ReviewIdsBodySchema,
        responses: {
            200: ReviewListSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const body = args.body as z.output<typeof ReviewIdsBodySchema>;
            await seenReviews(cms, args, body.ids);
            return {
                status: 200,
                body: {
                    reviews: await reopenReviews(cms, {
                        ids: body.ids,
                        by: authorOf(cms, args),
                    }),
                },
            };
        }) as never
    );

    const commentReview = route({
        method: 'POST',
        path: `${editingBase}/reviews/comments`,
        auth: editor,
        summary: "Comment on one field of a review's draft",
        description:
            'The person who asked sees the comment under that field in the editor, and the reviewer under the change. Anyone taking part in the review may comment: who asked, who was asked, who answered, and a role under `reviews.roles`. Name the field as the changes list keys it. Answers with the review and every comment on the draft.',
        tool: true,
        body: CommentBodySchema,
        responses: {
            201: ReviewStateSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const body = args.body as z.output<typeof CommentBodySchema>;
            const access = await seenReviews(cms, args, [body.review]);
            return {
                status: 201,
                body: await commentOnReview(cms, {
                    review: body.review,
                    path: body.path,
                    text: body.text,
                    by: authorOf(cms, args),
                    roleOn: (ref) => access.callerFor(ref).role,
                }),
            };
        }) as never
    );

    const resolveReviewComment = route({
        method: 'POST',
        path: `${editingBase}/reviews/comments/:id/resolve`,
        auth: editor,
        summary: 'Resolve a comment on a review once it is dealt with',
        description: 'The comment folds away under its field. Anyone taking part in the review may resolve it.',
        tool: {
            destructiveHint: false,
            idempotentHint: true,
        },
        pathParams: z.object({
            id: z.string(),
        }),
        responses: {
            200: ReviewStateSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const access = cms.access(args.auth);
            const comment = await cms.store.reviewComment(args.params['id']!);
            if (comment !== undefined) await seenReviews(cms, args, [comment.reviewId]);
            return {
                status: 200,
                body: await resolveComment(cms, {
                    id: args.params['id']!,
                    by: authorOf(cms, args),
                    roleOn: (ref) => access.callerFor(ref).role,
                }),
            };
        }) as never
    );

    const describe = route({
        method: 'GET',
        path: `${editingBase}/describe`,
        auth: editor,
        summary: 'Describe what is shown at a URL, or any document by its ref: its fields, what the caller may write, and the draft',
        description:
            'Start here when working from the page someone is looking at, or from a ref a source path or another tool gave you. Each field carries its path, the JSON Schema a value has to pass, and whether you may write it. `usedOn` says where else shared content appears; say so before changing it.',
        tool: {
            ui: documentView,
        },
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
            const access = cms.access(args.auth);
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
                access.assertSees(query.site);
                ref = await cms.pageAt(path, query.site);
                if (ref === undefined) throw new CmsHttpError(404, { detail: `No page is served at '${path}'.` });
            } else {
                throw new CmsHttpError(400, { detail: 'Pass a url or a ref.' });
            }
            access.assertSeesRef(ref);
            const caller = access.callerFor(ref);
            const state = await cms.draftState(ref);
            const draft = state.row?.draft ?? state.row?.published ?? null;
            const usedOn = await cms.usedOn(ref, (site) => access.sees(site));
            return {
                status: 200,
                body: {
                    ref: formatRef(ref),
                    kind: state.target.kind,
                    name: nameOf(ref),
                    ...(state.target.definition.label === undefined
                        ? {}
                        : {
                              label: state.target.definition.label,
                          }),
                    path: addressOf(state.target, draft) ?? null,
                    previewPath: previewPathOf(state.target, draft, usedOn),
                    usedOn,
                    status: state.status,
                    version: state.version,
                    complete: state.complete,
                    missing: state.missing,
                    fields: cms.describe(ref, draft, caller, await sharedContentOf(cms, state)),
                    layout: cms.describeLayout(ref),
                    draft,
                    ...(await reviewFields(cms, state)),
                    canPublish: cms.mayPublish(access, ref),
                    ...(ref.type === 'item' && state.target.shared === undefined
                        ? {
                              actions: await itemActions(cms, cms.collection(ref.collection, ref.site), ref, caller),
                          }
                        : {}),
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
        guarded(async (cms, args) => {
            const access = cms.access(args.auth);
            return {
                status: 200,
                body: {
                    pages: (await cms.summaries()).filter((page) => access.sees(page.site)),
                },
            };
        }) as never
    );

    const globalsList = (at: SiteAt) =>
        route({
            method: 'GET',
            path: `${editingBase}${at.prefix}/globals`,
            auth: editor,
            summary:
                at.prefix === ''
                    ? 'List every global, like the footer or site settings, with its status'
                    : "List a site's own globals, with their status",
            tool: true,
            ...(at.prefix === ''
                ? {}
                : {
                      pathParams: at.params,
                  }),
            responses: {
                200: {
                    body: z.object({
                        globals: z.array(
                            z.object({
                                name: z.string(),
                                label: z.string().nullable(),
                                group: z.string().nullable(),
                                status: PageStatusSchema,
                                version: z.int(),
                                updatedAt: z.string().nullable(),
                            })
                        ),
                    }),
                    cache: 'no-store',
                },
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 200,
                body: {
                    globals: await cms.globalSummaries(siteOf(cms, args, at)),
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
                pages: (await cms.whereUsed(args.params['brand']!, args.params['id']!)).filter((page) =>
                    cms.access(args.auth).sees(page.site)
                ),
            },
        })) as never
    );

    // A single-site project has one library, so its media routes take no `site`.
    const mediaQuery =
        siteEntries.length === 0
            ? {}
            : {
                  query: z.object({
                      site: MediaSiteQuery,
                  }),
              };

    /**
     * A media item the editor may open: shared, or of a site they open.
     */
    const seenMedia = async (cms: CmsService, args: Args, id: string) => {
        const record = await cms.media.get(id);
        if (record === undefined || !cms.access(args.auth).sees(record.site)) {
            throw new CmsHttpError(404, { detail: `No media item '${id}'.` });
        }
        return record;
    };

    /**
     * The library a media route works in, refused when it is a site the
     * editor may not open.
     */
    const seenLibrary = (cms: CmsService, args: Args): string | undefined => {
        const site = cms.mediaSiteOf(mediaSiteOf(args));
        cms.access(args.auth).assertSees(site);
        return site;
    };

    /**
     * Refuses a change to a shared image from an editor who is no admin over
     * every site, since every site shows it.
     */
    const assertChangesMedia = (cms: CmsService, args: Args, record: { id: string; site?: string }): void => {
        if (record.site !== undefined || cms.access(args.auth).publishesShared) return;
        throw new CmsHttpError(403, {
            detail: `The image '${record.id}' is shared, and every site shows it, so an admin over every site changes it.`,
        });
    };

    const listMedia = route({
        method: 'GET',
        path: `${editingBase}/media`,
        auth: editor,
        summary: 'List uploaded media, with how many pages hold each image',
        description: "With `site`, that site's own images beside the shared ones, each own image naming its site.",
        tool: true,
        ...mediaQuery,
        responses: {
            200: MediaListSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const site = seenLibrary(cms, args);
            const uses = await cms.mediaUses();
            return {
                status: 200,
                body: {
                    media: (await cms.media.list(site)).map((record) => ({
                        ...withUrl(cms, record),
                        uses: uses.get(record.id)?.length ?? 0,
                    })),
                    maxBytes: cms.media.maxBytes,
                },
            };
        }) as never
    );

    const mediaUses = route({
        method: 'GET',
        path: `${editingBase}/media/:id/uses`,
        auth: editor,
        summary: 'List the pages, globals and items that hold an image, and the fields holding it',
        tool: true,
        pathParams: z.object({
            id: z.string(),
        }),
        responses: {
            200: {
                body: MediaUsesSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const id = args.params['id']!;
            await seenMedia(cms, args, id);
            const access = cms.access(args.auth);
            return {
                status: 200,
                body: {
                    id,
                    uses: ((await cms.mediaUses()).get(id) ?? []).filter((use) => access.seesRef(use.ref)),
                },
            };
        }) as never
    );

    const deleteMedia = route({
        method: 'DELETE',
        path: `${editingBase}/media/:id`,
        auth: editor,
        summary: 'Delete an image and its stored file',
        description: 'Pages, globals and items that hold it lose the image, so list its uses first. The person confirms before this runs.',
        tool: {
            needsApproval: true,
        },
        pathParams: z.object({
            id: z.string(),
        }),
        ...mediaQuery,
        responses: {
            204: z.void(),
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const id = args.params['id']!;
            const record = await seenMedia(cms, args, id);
            cms.assertOwnMedia(record, seenLibrary(cms, args));
            assertChangesMedia(cms, args, record);
            const uses = (await cms.mediaUses()).get(id) ?? [];
            if (!(await cms.media.delete(id))) throw new CmsHttpError(404, { detail: `No media item '${id}'.` });
            await cms.revalidateMedia(uses);
            return {
                status: 204,
                body: undefined,
            };
        }) as never
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
            const record = await seenMedia(cms, args, args.params['id']!);
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
            const record = await seenMedia(cms, args, args.params['id']!);
            const bytes = await cms.media.bytes(record);
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
        auth: readAuth,
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
                    scope: reader === undefined ? 'public' : 'private',
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
            assertReads(args, record.site);
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
        summary: 'Set the default alt text or focal point of a media item, which every use without its own shows',
        tool: true,
        pathParams: z.object({
            id: z.string(),
        }),
        ...mediaQuery,
        body: UpdateMediaBodySchema,
        responses: {
            200: MediaSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const current = await seenMedia(cms, args, args.params['id']!);
            cms.assertOwnMedia(current, seenLibrary(cms, args));
            assertChangesMedia(cms, args, current);
            const record = await cms.media.update(
                args.params['id']!,
                args.body as z.output<typeof UpdateMediaBodySchema>,
                authorOf(cms, args)
            );
            if (record === undefined) throw new CmsHttpError(404, { detail: `No media item '${args.params['id']}'.` });
            await cms.revalidateMedia((await cms.mediaUses()).get(record.id) ?? []);
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
        ...mediaQuery,
        body: CreateUploadBodySchema,
        responses: {
            201: UploadSchema,
            404: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            seenLibrary(cms, args);
            return {
                status: 201,
                body: await cms.media.createUpload(args.body as z.output<typeof CreateUploadBodySchema>),
            };
        }) as never
    );

    const completeUpload = route({
        method: 'POST',
        path: `${editingBase}/media/uploads/:uploadId`,
        auth: editor,
        summary: 'Finish an upload: check the file and create the media item',
        pathParams: z.object({
            uploadId: z.string(),
        }),
        ...mediaQuery,
        responses: {
            201: MediaSchema,
            404: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const record = await cms.media.completeUpload(args.params['uploadId']!, authorOf(cms, args), seenLibrary(cms, args));
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
                        detail: z.string().optional(),
                        ...TreePlacementShape,
                    })
                ),
            }),
            404: ProblemDetailsSchema,
            502: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            const owned = cms.listingFor(args.params['brand']!);
            if (owned !== undefined && !cms.access(args.auth).sees(owned.site)) {
                throw new CmsHttpError(404, {
                    detail: `No collection or relationship holds ids of the brand '${args.params['brand']}'. Define a relationship for it with defineRelationship().`,
                });
            }
            return {
                status: 200,
                body: {
                    items: await cms.searchItems(args.params['brand']!, searchInput(args)),
                },
            };
        }) as never
    );

    const createPreview = route({
        method: 'POST',
        path: `${editingBase}/preview`,
        auth: editor,
        summary: "Open the site's draft",
        description: 'A link into draft mode that holds for ten minutes, for the editor to frame the site or open it in a tab.',
        tool: {
            visibility: ['app'],
        },
        body: z
            .object({
                path: z.string().optional().describe('The page to land on, like /blog/spring-sale.'),
            })
            .optional(),
        responses: {
            200: z.object({
                url: z.string().describe('A link into draft mode, for a browser tab or a frame on the site.'),
                proxy: z
                    .string()
                    .describe('Where the editor fetches the draft through, with `token`, in a host that will not frame the site.'),
                token: z.string(),
                expiresAt: z.string(),
            }),
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            if (options.preview === undefined) {
                throw new CmsHttpError(404, {
                    detail: 'The CMS does not know where the site is. Set `preview.url` on cms().',
                });
            }
            const body = args.body as { path?: string } | undefined;
            const token = cms.previewToken();
            const draft = new URL(`${options.apiPath ?? '/api'}${base}/draft`, options.preview.url);
            draft.searchParams.set('token', token);
            draft.searchParams.set('redirect', body?.path ?? '/');
            return {
                status: 200,
                body: {
                    url: draft.toString(),
                    proxy: previewProxyUrl(options.preview.url, options.apiPath ?? '/api', base),
                    token,
                    expiresAt: new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString(),
                },
            };
        }) as never
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
            ...contentReads,
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
            ...(siteEntries.length === 0
                ? {}
                : {
                      sites: {
                          pages: editingRoutes(sitePageScope),
                          globals: {
                              list: globalsList(onSite),
                              ...editingRoutes(siteGlobalScope),
                          },
                          collections: {
                              ...itemRoutes(onSite),
                              ...editingRoutes(siteItemScope),
                          },
                      },
                  }),
            globals: {
                list: globalsList(shared),
                ...editingRoutes(globalScope),
            },
            collections: {
                ...itemRoutes(shared),
                ...editingRoutes(itemScope),
            },
            media: {
                list: listMedia,
                get: getMedia,
                uses: mediaUses,
                getFile: getMediaFile,
                update: updateMedia,
                delete: deleteMedia,
                createUpload,
                completeUpload,
            },
            actions: collectionActionRoutes({
                collections: options.collections ?? [],
                editor,
                editingBase,
                guarded,
            }),
            ...((options.views ?? []).length === 0
                ? {}
                : {
                      listViews: listViewsRoute({
                          views: options.views ?? [],
                          editor,
                          editingBase,
                          guarded,
                      }),
                      views: viewRoutes({
                          views: options.views ?? [],
                          editor,
                          editingBase,
                          guarded,
                      }),
                  }),
            dashboard: dashboardRoute({
                widgets: options.dashboard,
                collections: options.collections ?? [],
                views: options.views ?? [],
                editor,
                editingBase,
                guarded,
            }),
            whereUsed,
            searchItems,
            createPreview,
            people: {
                list: listPeople,
            },
            reviews: {
                list: listReviews,
                request: requestReview,
                decide: decideReview,
                withdraw: withdrawReview,
                reopen: reopenReview,
                comment: commentReview,
                resolveComment: resolveReviewComment,
            },
        },
        invalidate,
    };
};

export type CmsRoutes = ReturnType<typeof cmsRoutes>;
