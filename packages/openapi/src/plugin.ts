import { z } from 'zod';
import { createPlugin, type RoutePath, type WithSlug } from 'kizunajs/plugin';
import { openApiServe } from './server.js';
import type { DocsProvider } from './docs-html.js';
import type { GenerateOpenApiOptions } from './types.js';

export const OPENAPI_PLUGIN_SLUG = 'openApi';

export type JsonDocumentPath = `${RoutePath}.json`;

export type YamlDocumentPath = `${RoutePath}.yaml`;

export interface OpenApiPluginProps<Slug extends string = typeof OPENAPI_PLUGIN_SLUG> extends GenerateOpenApiOptions {
    /**
     * What handlers reach this plugin under. Give a second document its own.
     *
     * @default 'openApi'
     */
    slug?: Slug;

    /**
     * Where the reference UI is served.
     */
    docsPath?: RoutePath;

    /**
     * Where the document is served. The UI embeds it, so this is only for
     * publishing the file.
     */
    jsonPath?: JsonDocumentPath;

    /**
     * Where the document is served as YAML.
     */
    yamlPath?: YamlDocumentPath;

    /**
     * Which API reference UI to render.
     *
     * @default 'scalar'
     */
    provider?: DocsProvider;

    /**
     * Where to load the UI's assets from, for a self-hosted copy. The script
     * URL for `'scalar'`; the directory holding `swagger-ui.css` and
     * `swagger-ui-bundle.js` for `'swagger'`.
     */
    cdnUrl?: string;

    /**
     * The page's `<title>`.
     *
     * @default the document's `info.title`
     */
    pageTitle?: string;

    /**
     * Merged into `Scalar.createApiReference` or `SwaggerUIBundle`.
     */
    configuration?: Record<string, unknown>;
}

/**
 * Serve an API reference UI for the OpenAPI document, and the document itself
 * if you publish it.
 *
 * The routes are public. Gate them with your framework's own middleware if that
 * is not what you want.
 *
 * @example
 * ```ts
 * export default defineConfig({
 *     routes,
 *     plugins: [
 *         openApiPlugin({
 *             info: {
 *                 title: 'My API',
 *                 version: '1.0.0',
 *             },
 *         }),
 *     ],
 * });
 * ```
 */
const declare = (slug: string, props: OpenApiPluginProps<string>) =>
    createPlugin({
        slug,
        routes: {
            ...(props.docsPath === undefined
                ? {}
                : {
                      page: {
                          method: 'GET',
                          path: props.docsPath,
                          summary: 'API reference',
                          responses: {
                              200: z.string(),
                          },
                      },
                  }),
            ...(props.jsonPath === undefined
                ? {}
                : {
                      json: {
                          method: 'GET',
                          path: props.jsonPath,
                          summary: 'OpenAPI document',
                          responses: {
                              200: z.unknown(),
                          },
                      },
                  }),
            ...(props.yamlPath === undefined
                ? {}
                : {
                      yaml: {
                          method: 'GET',
                          path: props.yamlPath,
                          summary: 'OpenAPI document, as YAML',
                          responses: {
                              200: z.string(),
                          },
                      },
                  }),
        },
        props,
        serve: (pluginProps, api) => openApiServe(pluginProps, api),
    });

export function openApiPlugin<const Slug extends string = typeof OPENAPI_PLUGIN_SLUG>(
    props: OpenApiPluginProps<Slug>
): WithSlug<ReturnType<typeof declare>, Slug> {
    return declare(props.slug ?? OPENAPI_PLUGIN_SLUG, props as OpenApiPluginProps<string>) as never;
}
