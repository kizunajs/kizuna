import { z } from 'zod';
import type { RouteAuth } from 'kizunajs';
import { RouteAuthSchema, RoutePathSchema } from 'kizunajs/plugin';
import { isPage, type Page } from './page.js';
import { isCollection, isGlobal, type Collection, type Global } from './definitions.js';
import type { CmsDatabase } from './storage/store.js';
import type { MediaStorage } from './media/storage.js';
import { isRelationship, type CmsRelationship } from './relationships.js';
import { isView, type View } from './view-definition.js';
import { DashboardWidgetSchema, OverviewWidgetSchema, type DashboardWidget, type OverviewWidget } from './dashboard.js';
import { isDeclaredSites, type DeclaredSites } from './site.js';
import type { TranslateOptions } from './translate.js';

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
     * The role, or roles, an editor holds on each site, from the identity's
     * context. Their own role covers the shared content, and `admin` there
     * is an admin over every site.
     *
     * @example
     * sites: (editor) => editor.sites,
     */
    sites?: (editor: Record<string, any>) => Partial<Record<string, string | readonly string[]>> | undefined;
    /**
     * The identity every content route requires, which partners sign in
     * with. Its guard returns the partner's name as `partner`, and that
     * partner then reads the shared content and the sites in its `reads`.
     * Content routes are public without it.
     *
     * @example
     * read: 'partner',
     */
    read?: string;
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
    /**
     * Signs an editor in with your app's own auth, and gives the admin a
     * sign-in screen of its own at `${adminPath}/login`. Return the
     * response your auth answers with: its cookies reach the browser, and a
     * status outside 2xx means the email or password was wrong.
     *
     * @example
     * ```ts
     * signIn: ({ email, password, headers }) =>
     *     auth.api.signInEmail({
     *         body: {
     *             email,
     *             password,
     *         },
     *         headers,
     *         asResponse: true,
     *     }),
     * ```
     */
    signIn?: (attempt: SignInAttempt) => Response | Promise<Response>;
    /**
     * Ends the editor's session, for the admin's Sign out. Its response's
     * cookies reach the browser, which lands on the sign-in screen.
     *
     * @example
     * ```ts
     * signOut: ({ headers }) =>
     *     auth.api.signOut({
     *         headers,
     *         asResponse: true,
     *     }),
     * ```
     */
    signOut?: (request: SignOutRequest) => Response | Promise<Response>;
    /**
     * The token a chat signs in with as the editor, for the admin's Edit in
     * your chat. It goes into the `claude mcp add` command the dialog shows,
     * so return one your editor identity accepts as a bearer, like the
     * session's own token. Without it, the command leaves a placeholder.
     *
     * @example
     * ```ts
     * chatToken: async ({ headers }) => {
     *     const found = await auth.api.getSession({
     *         headers,
     *     });
     *     return found?.session.token;
     * },
     * ```
     */
    chatToken?: (request: ChatTokenRequest) => string | null | undefined | Promise<string | null | undefined>;
}

/**
 * What an editor typed into the admin's sign-in screen, as `signIn` receives
 * it.
 */
export interface SignInAttempt {
    email: string;
    password: string;
    /**
     * The request's headers, with the cookies and client address your auth
     * reads.
     */
    headers: Headers;
}

/**
 * The admin's Sign out, as `signOut` receives it.
 */
export interface SignOutRequest {
    /**
     * The request's headers, with the session cookie to end.
     */
    headers: Headers;
}

/**
 * The admin's request, as `chatToken` receives it.
 */
export interface ChatTokenRequest {
    /**
     * The request's headers, with the session cookie your auth reads.
     */
    headers: Headers;
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
    /**
     * The role, or roles, they hold on each site, as `auth.sites` gives them,
     * so a site's documents suggest only its own people.
     */
    sites?: Partial<Record<string, string | readonly string[]>>;
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
    /**
     * Adds someone to your app's users with the role they hold on each site,
     * for People's Invite. Return a link they sign in with when your app
     * sends no email of its own, and the admin shows it to copy.
     *
     * @example
     * ```ts
     * invite: async ({ email, sites }) => {
     *     await createEditor(email, sites);
     *     return {
     *         link: await signInLinkFor(email),
     *     };
     * },
     * ```
     */
    invite?: (invitation: Invitation) => InvitationResult | Promise<InvitationResult>;
    /**
     * Stores the role someone holds on each site, for People. `sites` names
     * every site they keep, so one left out is one they no longer edit.
     *
     * @example
     * ```ts
     * setSites: ({ id, sites }) => updateEditorSites(id, sites),
     * ```
     */
    setSites?: (change: SitesChange) => void | Promise<void>;
}

/**
 * Someone an admin invites, as `invite` receives them.
 */
export interface Invitation {
    email: string;
    /**
     * The role they hold on each site.
     */
    sites: Record<string, string>;
    /**
     * Who invited them, by their id.
     */
    invitedBy: string;
}

export interface InvitationResult {
    /**
     * Their id in the people list.
     */
    id: string;
    /**
     * A link that signs them in, for the admin to copy to them.
     */
    link?: string;
}

/**
 * New roles for someone on the sites, as `setSites` receives them.
 */
export interface SitesChange {
    /**
     * Their id in the people list.
     */
    id: string;
    /**
     * The role they hold on each site they keep.
     */
    sites: Record<string, string | readonly string[]>;
    /**
     * Who changed it, by their id.
     */
    changedBy: string;
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
     * `admin`, and publish one before its approval comes.
     */
    roles?: string | readonly string[];
    /**
     * Runs after someone asks for a review, to tell the reviewers by email or
     * in a chat.
     */
    onReviewRequested?: (request: ReviewRequest) => void | Promise<void>;
}

/**
 * A business outside your sites that reads some of them and hears their
 * publishes.
 */
export interface PartnerOptions {
    /**
     * What editors call the partner, like `'Travel agency'`.
     */
    label: string;
    /**
     * The sites it reads, beside the shared content.
     */
    reads: readonly string[];
    /**
     * Where the CMS sends `{ brand, id }` when a document it reads
     * publishes, unpublishes or is deleted.
     */
    invalidate: {
        url: string;
        /**
         * What the partner's route expects, like the bearer token it gave
         * you.
         */
        headers?: () => Record<string, string> | Promise<Record<string, string>>;
    };
}

/**
 * Where shared content is stored, and a single-site project's pages.
 */
export const DEFAULT_SITE = 'default';

export interface CmsPluginOptions<
    Pages extends PageMap = PageMap,
    Sites extends DeclaredSites<any, any> | undefined = DeclaredSites | undefined,
> {
    /**
     * What editors call the site, which the admin's sign-in screen asks them
     * to sign in to and its tab titles end with.
     *
     * @example
     * ```ts
     * name: 'Hagen',
     * ```
     */
    name?: string;
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
     * The sites this CMS serves, made with `declareSites()`, in place of
     * `pages`. Each site has its own pages and may have globals and
     * collections of its own. The globals and collections here are shared by
     * every site.
     *
     * @example
     * sites: declareSites(Site, {
     *     uk: {
     *         label: 'Hagen UK',
     *         url: 'https://hagen.example.co.uk',
     *         icon: '/icons/uk.svg',
     *         pages: countryPages,
     *     },
     * }),
     */
    sites?: Sites;
    /**
     * The languages content is written in. The first is the source, and every
     * other holds a translation of it. With sites, every language a site
     * serves.
     *
     * @example
     * locales: ['nb', 'en'],
     */
    locales?: readonly string[];
    /**
     * The languages a language shows, in order, while it has no published
     * translation of its own. Without it, an untranslated page is not found
     * in that language.
     *
     * @example
     * fallback: {
     *     fr: ['de'],
     * },
     */
    fallback?: Readonly<Record<string, readonly string[]>>;
    /**
     * The model that drafts a translation when an editor asks for one.
     *
     * @example
     * translate: {
     *     model: anthropic('claude-sonnet-5-5'),
     * },
     */
    translate?: TranslateOptions;
    /**
     * The site this deployment shows, which `kizuna.content` reads in
     * process.
     *
     * @example
     * site: () => process.env.KIZUNA_SITE,
     */
    site?: () => string | undefined;
    /**
     * Businesses outside your sites that read them, by name.
     *
     * @example
     * partners: {
     *     travelAgency: {
     *         label: 'Travel agency',
     *         reads: ['uk'],
     *         invalidate: {
     *             url: 'https://travel.example.com/api/invalidate',
     *         },
     *     },
     * },
     */
    partners?: Record<string, PartnerOptions>;
    /**
     * The identity the refresh job runs as, one of the config's identities.
     * With `jobRunner: { mode: 'http' }`, name it when the app declares no
     * jobs of its own. Otherwise the job runs as the app's jobs do.
     *
     * @example
     * jobs: {
     *     identity: 'scheduler',
     * },
     */
    jobs?: {
        identity: string;
    };
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
    /**
     * Data the CMS shows and changes but does not store, like your app's
     * users, made with `defineView()`.
     */
    views?: readonly View<string, any, any>[];
    /**
     * The admin's first page, as widgets in the order shown. Without it,
     * `reviews` and `collections`. With sites, it runs for the site open.
     */
    dashboard?: readonly DashboardWidget<NoInfer<Sites>>[];
    /**
     * The sites compared, which an admin over every site opens. Without it,
     * `reviews`, `refreshes` and `reach`.
     */
    overview?: readonly OverviewWidget<NoInfer<Sites>>[];
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
     * Where a signed-out editor who opens the admin or draft mode is sent,
     * with `next` naming where they were going: a sign-in page of your app,
     * such as one that hands off to SSO. Takes the place of `auth.signIn`,
     * so name one of them.
     */
    signInPath?: string;
    /**
     * Where the admin's Sign out link goes: a page or route of your app that
     * ends the editor's session and answers `GET`. Takes the place of
     * `auth.signOut`, so name one of them. Without either, the admin shows no
     * Sign out.
     */
    signOutPath?: string;
    /**
     * Where the admin is served, from the site's root. A path under `apiPath`
     * is served by the API's own mount. Anywhere else, mount the API a second
     * time at the root, from a route file that matches this path and every
     * path under it.
     *
     * @default `/admin` under `apiPath` and `path`, so '/api/admin'
     *
     * @example
     * ```ts
     * adminPath: '/admin',
     * ```
     */
    adminPath?: `/${string}`;
    /**
     * A stylesheet of your app's that the admin, its sign-in screen and the
     * editor in the chat load after their own: a path on your site, or a full
     * URL. The admin's styles sit in the `kizuna` cascade layer, so any rule
     * here wins over them.
     *
     * @example
     * ```ts
     * adminCss: '/cms-admin.css',
     * ```
     */
    adminCss?: string;
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

const SiteContentSchema = z.object({
    pages: PageMapSchema.optional(),
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
});

export const CmsPluginOptionsSchema = z
    .object({
        name: z.string().min(1).optional(),
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
            .custom<DeclaredSites>(isDeclaredSites, {
                error: 'must be made with declareSites()',
            })
            .superRefine((sites, context) => {
                for (const [name, entry] of Object.entries(sites.entries)) {
                    const parsed = SiteContentSchema.safeParse(entry);
                    for (const issue of parsed.success ? [] : parsed.error.issues) {
                        context.addIssue({
                            code: 'custom',
                            message: issue.message,
                            path: [name, ...issue.path],
                        });
                    }
                }
            })
            .optional(),
        site: z.custom<() => string | undefined>(isFunction).optional(),
        locales: z
            .array(z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/, { error: "is a language code, like 'nb' or 'en-GB'" }))
            .min(1)
            .refine((locales) => new Set(locales).size === locales.length, {
                error: 'lists a language twice',
            })
            .optional(),
        fallback: z.record(z.string(), z.array(z.string())).optional(),
        translate: z
            .object({
                model: z.custom<TranslateOptions['model']>(
                    (model) => typeof model === 'string' || (typeof model === 'object' && model !== null),
                    {
                        error: 'must be an AI SDK language model',
                    }
                ),
            })
            .optional(),
        partners: z
            .record(
                z.string().min(1),
                z.object({
                    label: z.string().min(1),
                    reads: z.array(z.string().min(1)),
                    invalidate: z.object({
                        url: z.url(),
                        headers: z.custom<PartnerOptions['invalidate']['headers']>(isFunction).optional(),
                    }),
                })
            )
            .optional(),
        jobs: z
            .object({
                identity: z.string().min(1),
            })
            .optional(),
        auth: z.object({
            identity: z.string().min(1),
            roles: z.union([z.string(), z.array(z.string())]).optional(),
            sites: z.custom<CmsAuthOptions['sites']>(isFunction).optional(),
            read: z.string().min(1).optional(),
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
                    invite: z.custom<PeopleOptions['invite']>(isFunction).optional(),
                    setSites: z.custom<PeopleOptions['setSites']>(isFunction).optional(),
                })
                .optional(),
            invalidate: RouteAuthSchema.optional(),
            signIn: z.custom<CmsAuthOptions['signIn']>(isFunction).optional(),
            signOut: z.custom<CmsAuthOptions['signOut']>(isFunction).optional(),
            chatToken: z.custom<CmsAuthOptions['chatToken']>(isFunction).optional(),
        }),
        relationships: z
            .array(
                z.custom<CmsRelationship>(isRelationship, {
                    error: 'must be made with defineRelationship()',
                })
            )
            .optional(),
        views: z
            .array(
                z.custom<View>(isView, {
                    error: 'must be made with defineView()',
                })
            )
            .optional(),
        dashboard: z.array(DashboardWidgetSchema).optional(),
        overview: z.array(OverviewWidgetSchema).optional(),
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
        signOutPath: z.string().optional(),
        adminPath: RoutePathSchema.optional(),
        adminCss: z
            .string()
            .refine((href) => href.startsWith('/') || /^https?:\/\//.test(href), {
                error: 'takes a path on your site, like `/cms-admin.css`, or a full http or https URL',
            })
            .optional(),
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
    })
    .superRefine((options, context) => {
        const declared = Object.keys(options.sites?.entries ?? {});
        for (const [name, partner] of Object.entries(options.partners ?? {})) {
            if (declared.includes(name)) {
                context.addIssue({
                    code: 'custom',
                    message: `has the name of a site. A partner and a site are refreshed by name, so give the partner another`,
                    path: ['partners', name],
                });
            }
            for (const site of partner.reads) {
                if (declared.includes(site)) continue;
                context.addIssue({
                    code: 'custom',
                    message:
                        declared.length === 0
                            ? `reads the site '${site}', but cms() declares no sites. Declare them with declareSites()`
                            : `reads the site '${site}', which declareSites() does not declare. It declares ${declared.join(', ')}`,
                    path: ['partners', name, 'reads'],
                });
            }
        }
    })
    .superRefine((options, context) => {
        const locales = options.locales ?? [];
        for (const [name, values] of Object.entries(options.sites?.values ?? {})) {
            for (const locale of (values as { locales?: readonly string[] }).locales ?? []) {
                if (locales.includes(locale)) continue;
                context.addIssue({
                    code: 'custom',
                    message:
                        locales.length === 0
                            ? `serves '${locale}', but cms() lists no locales. List every language a site serves in \`locales\``
                            : `serves '${locale}', which \`locales\` on cms() does not list. It lists ${locales.join(', ')}`,
                    path: ['sites', name, 'locales'],
                });
            }
        }
        for (const [locale, chain] of Object.entries(options.fallback ?? {})) {
            for (const named of [locale, ...chain]) {
                if (locales.includes(named)) continue;
                context.addIssue({
                    code: 'custom',
                    message:
                        locales.length === 0
                            ? `names '${named}', but cms() lists no locales`
                            : `names '${named}', which \`locales\` does not list. It lists ${locales.join(', ')}`,
                    path: ['fallback', locale],
                });
            }
        }
    })
    .refine((options) => options.translate === undefined || (options.locales ?? []).length > 1, {
        error: 'translates between languages, but cms() lists fewer than two in `locales`',
        path: ['translate'],
    })
    .refine((options) => options.auth.sites === undefined || options.sites !== undefined, {
        error: 'gives editors roles on sites, but cms() declares no sites. Declare them with declareSites()',
        path: ['auth', 'sites'],
    })
    .refine((options) => options.auth.signIn === undefined || options.signInPath === undefined, {
        error: "takes `auth.signIn` for the admin's own sign-in screen, or `signInPath` for a page of your app, not both",
        path: ['signInPath'],
    })
    .refine((options) => options.auth.signOut === undefined || options.signOutPath === undefined, {
        error: "takes `auth.signOut` for the admin's own Sign out, or `signOutPath` for a route of your app, not both",
        path: ['signOutPath'],
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
 * One site's pages: a declared site's, or the `pages` of a single-site
 * project under the default site with the app `kizuna generate` scans.
 */
export interface SitePages {
    pages: PageMap;
    app?: string;
    output?: string;
}

/**
 * Every site's pages, keyed by site, leaving out a page whose `sites` names
 * others.
 */
export const sitesOf = (options: {
    pages?: PageMap;
    sites?: DeclaredSites;
    appDir?: string;
    pagesOutput?: string;
}): Record<string, SitePages> =>
    options.sites === undefined
        ? {
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
          }
        : Object.fromEntries(
              Object.entries(options.sites.entries).map(([site, entry]) => [
                  site,
                  {
                      pages: Object.fromEntries(
                          Object.entries(entry.pages ?? {}).filter(
                              ([, page]) => page.page.sites === undefined || page.page.sites.includes(site)
                          )
                      ),
                  },
              ])
          );
