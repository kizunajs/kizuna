import type { z } from 'zod';
import type { PluginApi, PluginDeclaration } from './plugin.js';
import type { Routes } from './types.js';

// Registry-global, like the plugin keys: a dual ESM/CJS install would otherwise
// hold two different symbols.
export const CONTENT_META_KEY: unique symbol = Symbol.for('kizuna.content') as symbol as typeof CONTENT_META_KEY;
const CONTENT_PROVIDER: unique symbol = Symbol.for('kizuna.content-provider') as symbol as typeof CONTENT_PROVIDER;

/**
 * One kind of document editors change: a page, a global or a collection,
 * with the schema its stored copies are read against.
 */
export interface ContentDocument {
    /**
     * Unique across the provider, like `page:frontPage` or `collection:articles`.
     */
    ref: string;
    kind: 'page' | 'global' | 'collection';
    name: string;
    schema: z.ZodType;
    /**
     * The highest `migrate` step it declares, or 0.
     */
    migration: number;
}

/**
 * The cookies of the request being rendered or served.
 */
export interface ContentCookies {
    get: (name: string) => string | undefined;
    set: (
        name: string,
        value: string,
        options: {
            httpOnly?: boolean;
            sameSite?: 'lax' | 'strict' | 'none';
            secure?: boolean;
            path?: string;
            maxAge?: number;
        }
    ) => void;
    delete: (name: string) => void;
}

/**
 * What a framework gives content reading, supplied by its adapter: a cache with
 * tags, draft mode, the request's cookies, and its not-found answer.
 */
export interface ContentRuntime {
    /**
     * Wraps a read in the framework's cache, keyed by `keys` and dropped by any
     * of `tags`.
     */
    cache: <Args extends unknown[], Result>(
        read: (...args: Args) => Promise<Result>,
        keys: readonly string[],
        tags: readonly string[]
    ) => (...args: Args) => Promise<Result>;
    revalidate: (tags: readonly string[]) => void | Promise<void>;
    draftMode: () => Promise<{
        enabled: boolean;
        enable: () => void;
        disable: () => void;
    }>;
    cookies: () => Promise<ContentCookies>;
    notFound: () => Promise<never>;
}

/**
 * What `content` on `defineConfig` takes: the routes it serves beside the
 * API's own, its server half as a plugin, the reader `kizuna.content` hands
 * out, and the documents `kizuna diff` compares.
 */
export interface ContentProvider<Reader = unknown, ProviderRoutes extends Routes = Routes> {
    readonly [CONTENT_PROVIDER]: true;
    /**
     * Its server half: exports its routes' handlers reach, hidden routes,
     * generated files and the check it runs once the config assembles.
     */
    readonly plugin: PluginDeclaration;
    /**
     * Route groups joined to the API's own at the top level, so they reach the
     * clients, the OpenAPI document and MCP like any route.
     */
    readonly routes: ProviderRoutes;
    /**
     * Builds the reader once the config has assembled, with the adapter's
     * runtime when it has one.
     */
    readonly reader: (context: { api: PluginApi; runtime: ContentRuntime | undefined }) => Reader;
    /**
     * Every document editors change.
     */
    readonly documents: () => readonly ContentDocument[];
}

/**
 * Builds a value `content` takes.
 */
export const defineContentProvider = <Reader, ProviderRoutes extends Routes>(
    provider: Omit<ContentProvider<Reader, ProviderRoutes>, typeof CONTENT_PROVIDER>
): ContentProvider<Reader, ProviderRoutes> => ({
    ...provider,
    [CONTENT_PROVIDER]: true,
});

export const isContentProvider = (value: unknown): value is ContentProvider =>
    typeof value === 'object' && value !== null && CONTENT_PROVIDER in value;

/**
 * What an assembled api holds about its content.
 */
export interface ContentMeta {
    provider: ContentProvider;
    reader: unknown;
    runtime: ContentRuntime | undefined;
}

/**
 * The content an api serves, or `undefined` when its config has none.
 */
export const contentOf = (api: unknown): ContentMeta | undefined =>
    (api as Record<symbol, ContentMeta | undefined> | undefined)?.[CONTENT_META_KEY];

/**
 * The reader type a provider hands out.
 */
export type ContentReaderOf<Value> = Value extends ContentProvider<infer Reader, any> ? Reader : undefined;

/**
 * The route groups a provider adds.
 */
export type ContentRoutesOf<Value> = Value extends ContentProvider<any, infer ProviderRoutes> ? ProviderRoutes : {};
