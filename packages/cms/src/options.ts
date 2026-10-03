import { z } from 'zod';
import type { RouteAuth } from 'kizunajs';
import { RouteAuthSchema, RoutePathSchema } from 'kizunajs/plugin';
import { isPage, type Page } from './page.js';
import { isCollection, isGlobal, type Collection, type Global } from './definitions.js';
import type { CmsDatabase } from './storage/store.js';
import type { MediaStorage } from './media/storage.js';
import { isRelationship, type CmsRelationship } from './relationships.js';

/**
 * One discovered page: where it is served, and what it declares.
 */
export interface PageEntry<P extends Page = Page> {
    path: string;
    page: P;
}

/**
 * Every page, keyed by name. `kizuna generate` and `withKizunaCms` write it
 * from the `content.ts` files under `app/`.
 */
export type PageMap = Record<string, PageEntry>;

/**
 * The pages module's export, kept as written so each path stays a literal
 * type and a dynamic page's reader knows its params.
 */
export const definePages = <const Pages extends PageMap>(pages: Pages): Pages => pages;

/**
 * Another deployment of this app, for `kizuna cms push` and `pull`.
 */
export interface EnvironmentOptions {
    /**
     * Where the API is served, including the mount path: `https://staging.example.com/api`.
     */
    url: string;
    /**
     * Headers every request carries, such as the editor's credential.
     */
    headers?: Record<string, string>;
    /**
     * `pull` refuses to write into it.
     */
    production?: boolean;
}

export interface MediaOptions {
    /**
     * The S3 bucket. Defaults to `CMS_S3_BUCKET`.
     */
    bucket?: string;
    /**
     * `auto` for R2, the project's region for Supabase, the bucket's for AWS.
     * Defaults to `CMS_S3_REGION`.
     */
    region?: string;
    /**
     * The store's S3 endpoint, for Supabase Storage, R2, MinIO and the rest.
     * Defaults to `CMS_S3_ENDPOINT`; leave it unset for AWS.
     */
    endpoint?: string;
    /**
     * Defaults to `CMS_S3_ACCESS_KEY_ID`, then the AWS SDK's own lookup.
     */
    accessKeyId?: string;
    /**
     * Defaults to `CMS_S3_SECRET_ACCESS_KEY`, then the AWS SDK's own lookup.
     */
    secretAccessKey?: string;
    /**
     * Address objects as `endpoint/bucket/key`. On by default whenever an
     * endpoint is set.
     */
    forcePathStyle?: boolean;
    /**
     * Where the browser reaches the image route, which is `basePath` under
     * the api's mount path.
     *
     * @default '/api/cms/media'
     */
    publicPath?: string;
    /**
     * The largest upload accepted, in bytes.
     *
     * @default 10485760
     */
    maxBytes?: number;
    /**
     * Somewhere other than S3 to keep files, such as `memoryMediaStorage()`
     * for a demo.
     */
    storage?: MediaStorage;
}

export interface CmsAuthOptions {
    /**
     * The identity editors sign in as. Every editing route requires it.
     */
    identity: string;
    /**
     * The roles that may edit at all. Field `auth` narrows within these.
     */
    roles?: string | readonly string[];
    /**
     * How a version names its author, from the identity's context. Without
     * it, the context's `userId`, `id`, `email` or `name`.
     */
    author?: (context: Record<string, unknown>) => string;
    /**
     * Everyone who edits, so the editor shows owners and reviewers by name and
     * picture.
     */
    people?: PeopleOptions;
    /**
     * Who may call the `invalidate` route, in a route's own words: usually
     * the app API's key, so the app refreshes the pages that show a product
     * it changed. Editors when left out.
     */
    invalidate?: RouteAuth;
}

/**
 * Someone who edits, as the editor shows them.
 */
export interface Person {
    /**
     * The value `author` returns for them, so versions and reviews name them.
     */
    id: string;
    name: string;
    email?: string;
    /**
     * A picture, as a URL whose origin is under `imageOrigins`.
     */
    image?: string;
    roles?: readonly string[];
}

export interface PeopleOptions {
    /**
     * Everyone who edits, read from the app's own users.
     */
    list: () => readonly Person[] | Promise<readonly Person[]>;
    /**
     * The origins people's pictures load from, which the editor is allowed to
     * show.
     */
    imageOrigins?: readonly string[];
}

/**
 * A review someone asked for, as `onReviewRequested` receives it.
 */
export interface ReviewRequest {
    documents: ReadonlyArray<{
        ref: string;
        label: string;
        path: string | null;
    }>;
    reviewers: readonly Person[];
    requestedBy: Person;
    note: string | null;
}

export interface ReviewOptions {
    /**
     * Roles that may approve any document without being asked, such as
     * `admin`.
     */
    roles?: string | readonly string[];
    /**
     * Runs after someone asks for a review, to tell the reviewers by email or
     * in a chat.
     */
    onReviewRequested?: (request: ReviewRequest) => void | Promise<void>;
}

/**
 * One Next.js app of several sharing the CMS: its pages, as the module
 * generated into it exports them, and where its `app` directory is.
 */
export interface SiteOptions<Pages extends PageMap = PageMap> {
    /**
     * The pages, as the `cms.pages.ts` written into this app exports them.
     */
    pages: Pages;
    /**
     * The app's `app` directory, relative to the working directory, which
     * `kizuna generate` scans for `content.ts` files.
     */
    app: string;
    /**
     * Where this app's pages module is written.
     *
     * @default beside `app`, as `cms.pages.ts`
     */
    output?: string;
}

/**
 * The site a single-app project's pages belong to, and the one a document
 * with no site of its own is stored under.
 */
export const DEFAULT_SITE = 'default';

export interface CmsPluginOptions<
    Pages extends PageMap = PageMap,
    Sites extends Record<string, SiteOptions> = Record<string, SiteOptions>,
> {
    /**
     * The Drizzle database the three `cms_` tables live in. A dedicated
     * instance on a role limited to those tables keeps a CMS bug away from
     * app data.
     */
    db: CmsDatabase;
    /**
     * The pages, as the generated `cms.pages.ts` exports them.
     */
    pages?: Pages;
    /**
     * Several Next.js apps sharing one CMS, keyed by a site name, in place of
     * `pages`. Each app's pages are stored and read under its site; globals
     * and collections are shared.
     *
     * @example
     * sites: {
     *     web: {
     *         pages: webPages,
     *         app: '../../apps/web/src/app',
     *     },
     *     campaign: {
     *         pages: campaignPages,
     *         app: '../../apps/campaign/src/app',
     *     },
     * },
     */
    sites?: Sites;
    /**
     * Content with one instance and no route, made with `defineGlobal()`.
     */
    globals?: readonly Global[];
    /**
     * Content with many instances and no route, made with `defineCollection()`.
     */
    collections?: readonly Collection[];
    auth: CmsAuthOptions;
    /**
     * What pages hold by id from outside the CMS, like products from your own
     * API, made with `defineRelationship()`.
     */
    relationships?: readonly CmsRelationship<string, any>[];
    media?: MediaOptions;
    /**
     * Who may approve a review, and how reviewers hear of one.
     */
    reviews?: ReviewOptions;
    /**
     * Signs the tokens that open draft mode. Defaults to
     * `KIZUNA_CMS_PREVIEW_SECRET`.
     */
    previewSecret?: string;
    /**
     * Drops cached renders for the tags given. The adapter does it on its own,
     * so pass this only when the site runs somewhere else, to call a route on
     * it that does.
     */
    revalidate?: (tags: readonly string[]) => void | Promise<void>;
    /**
     * Where a signed-out editor who opens draft mode is sent, with `next`
     * naming where they were going.
     */
    signInPath?: string;
    /**
     * Where the site is, so the editor can show its draft beside the form.
     *
     * @example
     * ```ts
     * preview: {
     *     url: 'https://example.com',
     * },
     * ```
     */
    preview?: {
        url: string;
    };
    environments?: Record<string, EnvironmentOptions>;
    /**
     * Where the CMS routes are served within the API.
     *
     * @default '/'
     */
    path?: `/${string}`;
    /**
     * Where the API is mounted, which the image URLs the reader hands out
     * start with: `/cms-api` for a CMS API mounted there.
     *
     * @default '/api'
     */
    apiPath?: string;
    /**
     * Where `content.ts` files are looked for, relative to the working
     * directory. Found on its own when the app has `src/app` or `app`.
     */
    appDir?: string;
    /**
     * Where the pages module is written.
     *
     * @default beside `appDir`, as `cms.pages.ts`
     */
    pagesOutput?: string;
}

const isFunction = (value: unknown): value is (...args: never[]) => unknown => typeof value === 'function';

const PageMapSchema = z.custom<PageMap>(
    (value) =>
        typeof value === 'object' &&
        value !== null &&
        Object.entries(value).every(
            ([name, entry]) =>
                typeof entry === 'object' &&
                entry !== null &&
                typeof (entry as PageEntry).path === 'string' &&
                isPage((entry as PageEntry).page) &&
                (entry as PageEntry).page.name === name
        ),
    {
        error: 'must be the pages module kizuna generate writes, with each page keyed by its own name',
    }
);

export const CmsPluginOptionsSchema = z
    .object({
        db: z.custom<CmsDatabase>((value) => typeof value === 'object' && value !== null && 'select' in value, {
            error: 'must be a Drizzle database',
        }),
        globals: z
            .array(
                z.custom<Global>(isGlobal, {
                    error: 'must be made with defineGlobal()',
                })
            )
            .optional(),
        collections: z
            .array(
                z.custom<Collection>(isCollection, {
                    error: 'must be made with defineCollection()',
                })
            )
            .optional(),
        pages: PageMapSchema.optional(),
        sites: z
            .record(
                z.string().regex(/^[a-z][a-z0-9-]*$/, {
                    error: 'is a site name, lowercase like web or campaign',
                }),
                z.object({
                    pages: PageMapSchema,
                    app: z.string(),
                    output: z.string().optional(),
                })
            )
            .optional(),
        auth: z.object({
            identity: z.string().min(1),
            roles: z.union([z.string(), z.array(z.string())]).optional(),
            author: z.custom<CmsAuthOptions['author']>(isFunction).optional(),
            people: z
                .object({
                    list: z.custom<PeopleOptions['list']>(isFunction),
                    imageOrigins: z
                        .array(
                            z.string().refine((origin) => URL.canParse(origin) && new URL(origin).origin === origin, {
                                error: "is an origin, like 'https://cdn.example.com'",
                            })
                        )
                        .optional(),
                })
                .optional(),
            invalidate: RouteAuthSchema.optional(),
        }),
        relationships: z
            .array(
                z.custom<CmsRelationship>(isRelationship, {
                    error: 'must be made with defineRelationship()',
                })
            )
            .optional(),
        media: z
            .object({
                bucket: z.string().optional(),
                region: z.string().optional(),
                endpoint: z.string().optional(),
                accessKeyId: z.string().optional(),
                secretAccessKey: z.string().optional(),
                forcePathStyle: z.boolean().optional(),
                publicPath: z.string().optional(),
                maxBytes: z.int().min(1).optional(),
                storage: z.custom<MediaStorage>((value) => typeof value === 'object' && value !== null).optional(),
            })
            .optional(),
        reviews: z
            .object({
                roles: z.union([z.string(), z.array(z.string())]).optional(),
                onReviewRequested: z.custom<ReviewOptions['onReviewRequested']>(isFunction).optional(),
            })
            .optional(),
        previewSecret: z.string().optional(),
        revalidate: z.custom<CmsPluginOptions['revalidate']>(isFunction).optional(),
        signInPath: z.string().optional(),
        preview: z
            .object({
                url: z.url(),
            })
            .optional(),
        environments: z
            .record(
                z.string(),
                z.object({
                    url: z.url(),
                    headers: z.record(z.string(), z.string()).optional(),
                    production: z.boolean().optional(),
                })
            )
            .optional(),
        path: RoutePathSchema.optional(),
        apiPath: z.string().optional(),
        appDir: z.string().optional(),
        pagesOutput: z.string().optional(),
    })
    .refine((options) => options.pages === undefined || options.sites === undefined, {
        error: 'takes `pages` for one app, or `sites` for several, not both',
        path: ['sites'],
    });

export type ResolvedCmsOptions = z.output<typeof CmsPluginOptionsSchema>;

/**
 * The `path` option as a prefix for the CMS routes: nothing by default, so
 * they sit at the API's root.
 */
export const routePrefix = (path: string | undefined): '' | `/${string}` => {
    const trimmed = (path ?? '/').replace(/\/+$/, '');
    return trimmed === '' ? '' : (trimmed as `/${string}`);
};

/**
 * Every site's pages: the `sites` option, or the `pages` of a single-app
 * project under the default site.
 */
export const sitesOf = (options: {
    pages?: PageMap;
    sites?: Record<string, { pages: PageMap; app?: string; output?: string }>;
    appDir?: string;
    pagesOutput?: string;
}): Record<string, { pages: PageMap; app?: string; output?: string }> =>
    options.sites ?? {
        [DEFAULT_SITE]: {
            pages: options.pages ?? {},
            ...(options.appDir === undefined
                ? {}
                : {
                      app: options.appDir,
                  }),
            ...(options.pagesOutput === undefined
                ? {}
                : {
                      output: options.pagesOutput,
                  }),
        },
    };
