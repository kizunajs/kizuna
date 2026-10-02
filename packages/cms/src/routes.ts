import { z } from 'zod';
import { route, type PluginDeclaration } from 'kizunajs/plugin';
import { BinarySchema, ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import type { RouteAuth } from 'kizunajs';
import { CmsHttpError, type CmsService } from './cms.js';
import type { CmsPluginOptions } from './options.js';
import {
    CreateUploadBodySchema,
    DescribedPageSchema,
    DraftHeadersSchema,
    DraftPageSchema,
    MediaListSchema,
    MediaSchema,
    MissingFieldsSchema,
    PageSummarySchema,
    PreviewSchema,
    PublishBodySchema,
    PublishedPageSchema,
    RollbackBodySchema,
    UpdateDraftBodySchema,
    UpdateDraftHeadersSchema,
    UpdateMediaBodySchema,
    UploadSchema,
    VersionListSchema,
    WhereUsedSchema,
} from './wire.js';
import { UploadRejectedError } from './media/media.js';
import { ImageQuerySchema } from './wire.js';

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

const pageName = (name: string): string => name.replace(/^-/, '');

const promptFor = (name: string): string =>
    `Fill in the ${name
        .replace(/Page$/, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()} page.`;

const draftBody = (state: Awaited<ReturnType<CmsService['draftState']>>) => ({
    name: state.entry.page.name,
    path: state.entry.path,
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
 * The routes the CMS answers, for the app to mount beside its own:
 *
 * ```ts
 * routes: {
 *     ...routes,
 *     cms: cmsRoutes(cms),
 * },
 * ```
 *
 * They are ordinary routes, so they reach the OpenAPI document, the generated
 * clients and MCP like any other, behind the identity the plugin names. The
 * handlers reach the plugin at `plugins.<slug>`.
 */
export const cmsRoutes = (declaration: PluginDeclaration<string, any>) => {
    const options = declaration.input as CmsPluginOptions;
    const slug = declaration.slug;
    const base = options.basePath ?? '/cms';
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
            throw new Error(`cmsRoutes() found no plugin at plugins.${slug}. Install cmsPlugin under that slug.`);
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

    return {
        getPublished: route({
            method: 'GET',
            path: `${base}/pages/:name`,
            auth: false,
            summary: 'Read the published content of a page',
            pathParams: z.object({
                name: z.string(),
            }),
            responses: {
                200: {
                    body: PublishedPageSchema,
                    etag: true,
                    cache: {
                        scope: 'public',
                        maxAge: 0,
                        staleWhileRevalidate: 60,
                    },
                },
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const name = pageName(args.params['name']!);
                const published = await cms.published(name);
                if (published === undefined) throw new CmsHttpError(404, { detail: `The page '${name}' is not published.` });
                return {
                    status: 200,
                    body: {
                        name,
                        path: cms.entry(name).path,
                        version: published.version,
                        content: published.content,
                        updatedAt: published.updatedAt.toISOString(),
                    },
                };
            }) as never
        ),

        listPages: route({
            method: 'GET',
            path: `${base}/pages`,
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
        ),

        describePage: route({
            method: 'GET',
            path: `${base}/describe`,
            auth: editor,
            summary: 'Describe the page at a URL: its fields, what the caller may write, and the draft',
            description:
                'Start here when working from the page someone is looking at. Each field carries its path, the JSON Schema a value has to pass, and whether you may write it.',
            tool: true,
            query: z.object({
                url: z.string().describe('The page URL or path, like https://example.com/lp/spring or /lp/spring.'),
            }),
            responses: {
                200: DescribedPageSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const given = String((args.query as { url: string }).url);
                let path: string;
                try {
                    path = new URL(given, 'http://cms.local').pathname;
                } catch {
                    throw new CmsHttpError(404, { detail: `'${given}' is not a URL or a path.` });
                }
                const entry = cms.entryAt(path);
                if (entry === undefined) throw new CmsHttpError(404, { detail: `No page is served at '${path}'.` });
                const state = await cms.draftState(entry.page.name);
                const caller = cms.caller(args.auth);
                return {
                    status: 200,
                    body: {
                        name: entry.page.name,
                        path: entry.path,
                        url: given,
                        status: state.status,
                        version: state.version,
                        complete: state.complete,
                        missing: state.missing,
                        fields: cms.describe(entry.page.name, given, state.row?.draft ?? null, caller),
                        draft: state.row?.draft ?? null,
                    },
                    headers: {
                        etag: state.etag,
                    },
                };
            }) as never
        ),

        getDraft: route({
            method: 'GET',
            path: `${base}/pages/:name/draft`,
            auth: editor,
            summary: 'Read the draft of a page',
            tool: true,
            pathParams: z.object({
                name: z.string(),
            }),
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
                const state = await cms.draftState(pageName(args.params['name']!));
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
            path: `${base}/pages/:name/missing`,
            auth: editor,
            summary: 'List the fields a draft still needs before it can publish',
            tool: true,
            pathParams: z.object({
                name: z.string(),
            }),
            responses: {
                200: MissingFieldsSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const name = pageName(args.params['name']!);
                const state = await cms.draftState(name);
                return {
                    status: 200,
                    body: {
                        name,
                        complete: state.complete,
                        missing: state.missing,
                        prompt: promptFor(name),
                    },
                };
            }) as never
        ),

        history: route({
            method: 'GET',
            path: `${base}/pages/:name/versions`,
            auth: editor,
            summary: 'List the versions of a page, newest first',
            tool: true,
            pathParams: z.object({
                name: z.string(),
            }),
            responses: {
                200: VersionListSchema,
                404: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => {
                const name = pageName(args.params['name']!);
                return {
                    status: 200,
                    body: {
                        name,
                        versions: await cms.history(name),
                    },
                };
            }) as never
        ),

        whereUsed: route({
            method: 'GET',
            path: `${base}/refs/:brand/:id`,
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
        ),

        updateDraft: route({
            method: 'PATCH',
            path: `${base}/pages/:name/draft`,
            auth: editor,
            summary: 'Change fields on the draft of a page',
            description:
                'Changes are keyed by field path and merged into the draft, which is then checked against the whole page schema. Describe the page first to learn the paths, the schemas and which fields you may write. Nothing goes live until the page is published.',
            tool: true,
            pathParams: z.object({
                name: z.string(),
            }),
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
                    name: pageName(args.params['name']!),
                    changes: body.changes,
                    caller: cms.caller(args.auth),
                    author: authorOf(cms, args),
                    summary: body.summary,
                    ifMatch: args.headers['if-match'],
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

        publish: route({
            method: 'POST',
            path: `${base}/pages/:name/publish`,
            auth: editor,
            summary: 'Publish the draft of a page',
            description: 'Makes the current draft what every visitor sees. The person confirms before this runs.',
            tool: {
                needsApproval: true,
                destructiveHint: false,
                idempotentHint: true,
            },
            pathParams: z.object({
                name: z.string(),
            }),
            body: PublishBodySchema,
            responses: {
                200: DraftPageSchema,
                404: ProblemDetailsSchema,
                409: ProblemDetailsSchema,
            },
        }).handler(
            guarded(async (cms, args) => ({
                status: 200,
                body: draftBody(await cms.publish(pageName(args.params['name']!), authorOf(cms, args))),
            })) as never
        ),

        rollback: route({
            method: 'POST',
            path: `${base}/pages/:name/rollback`,
            auth: editor,
            summary: 'Restore an earlier version of a page as a new draft',
            description: 'Nothing is published by this. The restored content becomes the draft, which is published separately.',
            tool: {
                needsApproval: true,
                destructiveHint: false,
            },
            pathParams: z.object({
                name: z.string(),
            }),
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
                        pageName(args.params['name']!),
                        (args.body as z.output<typeof RollbackBodySchema>).version,
                        authorOf(cms, args)
                    )
                ),
            })) as never
        ),

        listMedia: route({
            method: 'GET',
            path: `${base}/media`,
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
        ),

        getMedia: route({
            method: 'GET',
            path: `${base}/media/:id`,
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
        ),

        getMediaFile: route({
            method: 'GET',
            path: `${base}/media/:id/file`,
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
        ),

        getImage: route({
            method: 'GET',
            path: `${base}/media/:id/image`,
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
        ),

        updateMedia: route({
            method: 'PATCH',
            path: `${base}/media/:id`,
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
        ),

        createUpload: route({
            method: 'POST',
            path: `${base}/media/uploads`,
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
        ),

        completeUpload: route({
            method: 'POST',
            path: `${base}/media/uploads/:uploadId`,
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
        ),

        searchItems: route({
            method: 'GET',
            path: `${base}/items/:brand`,
            auth: editor,
            summary: "Find items a page can reference, through the brand's registered search route",
            pathParams: z.object({
                brand: z.string(),
            }),
            query: z.object({
                q: z.string().optional(),
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
                    items: await cms.searchItems(
                        args.params['brand']!,
                        (args.query as { q?: string } | undefined)?.q,
                        args as unknown as Record<string, unknown>
                    ),
                },
            })) as never
        ),

        createPreview: route({
            method: 'POST',
            path: `${base}/preview`,
            auth: editor,
            summary: 'Mint a short-lived token that opens draft mode on the site',
            responses: {
                201: PreviewSchema,
            },
        }).handler(
            guarded(async (cms) => ({
                status: 201,
                body: {
                    token: cms.previewToken(),
                    expiresIn: 600,
                },
            })) as never
        ),
    };
};

export type CmsRoutes = ReturnType<typeof cmsRoutes>;
