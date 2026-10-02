import { z } from 'zod';
import type { RouteDefinition } from 'kizunajs';
import { RoutePathSchema } from 'kizunajs/plugin';
import { isPage, type Page } from './page.js';
import type { CmsDatabase } from './storage/store.js';
import type { MediaStorage } from './media/storage.js';

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
 * What the CMS knows about one brand, all optional.
 */
export interface BrandOptions<Item = any> {
    /**
     * A route marked `tool: true` that finds items. It powers the picker and
     * tells the agent where to look for ids.
     */
    search?: RouteDefinition;
    /**
     * What a picker row and a history diff show for an item.
     */
    label?: (item: Item) => string;
    /**
     * A thumbnail for a picker row.
     */
    image?: (item: Item) => string | undefined;
    /**
     * Which of the ids exist. `kizuna cms push` checks every id with it.
     */
    exists?: (ids: readonly string[]) => Promise<readonly string[]> | readonly string[];
}

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
}

/**
 * What `cmsPlugin` takes.
 */
export interface CmsPluginOptions<Pages extends PageMap = PageMap> {
    /**
     * The Drizzle database the three `cms_` tables live in. A dedicated
     * instance on a role limited to those tables keeps a CMS bug away from
     * app data.
     */
    db: CmsDatabase;
    /**
     * The pages, as the generated `cms.pages.ts` exports them.
     */
    pages: Pages;
    auth: CmsAuthOptions;
    brands?: Record<string, BrandOptions>;
    media?: MediaOptions;
    /**
     * Signs the tokens that open draft mode. Defaults to
     * `KIZUNA_CMS_PREVIEW_SECRET`.
     */
    previewSecret?: string;
    /**
     * Drops cached renders for the tags given. In Next, pass `nextRevalidate`
     * from `@kizunajs/cms/next`.
     */
    revalidate?: (tags: readonly string[]) => void | Promise<void>;
    environments?: Record<string, EnvironmentOptions>;
    /**
     * Where the routes are served.
     *
     * @default '/cms'
     */
    basePath?: `/${string}`;
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

export const CmsPluginOptionsSchema = z.object({
    db: z.custom<CmsDatabase>((value) => typeof value === 'object' && value !== null && 'select' in value, {
        error: 'must be a Drizzle database',
    }),
    pages: z.custom<PageMap>(
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
    ),
    auth: z.object({
        identity: z.string().min(1),
        roles: z.union([z.string(), z.array(z.string())]).optional(),
        author: z.custom<CmsAuthOptions['author']>(isFunction).optional(),
    }),
    brands: z
        .record(
            z.string(),
            z.object({
                search: z.custom<RouteDefinition>((value) => typeof value === 'object' && value !== null).optional(),
                label: z.custom<(item: any) => string>(isFunction).optional(),
                image: z.custom<(item: any) => string | undefined>(isFunction).optional(),
                exists: z.custom<BrandOptions['exists']>(isFunction).optional(),
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
    previewSecret: z.string().optional(),
    revalidate: z.custom<CmsPluginOptions['revalidate']>(isFunction).optional(),
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
    basePath: RoutePathSchema.optional(),
    appDir: z.string().optional(),
    pagesOutput: z.string().optional(),
});

export type ResolvedCmsOptions = z.output<typeof CmsPluginOptionsSchema>;
