import { z } from 'zod';
import { definePlugin, RoutePathSchema, type RoutePath } from 'kizunajs/plugin';
import { defineGenerator } from 'kizunajs/generator';
import { openApiRoutes } from './server.js';
import { renderOpenApi } from './generator.js';
import { GenerateOpenApiOptionsSchema, type GenerateOpenApiOptions } from './types.js';

export const OPENAPI_PLUGIN_SLUG = 'openApi';

export type JsonDocumentPath = `${RoutePath}.json`;

export type YamlDocumentPath = `${RoutePath}.yaml`;

const OpenApiPluginOptionsSchema = GenerateOpenApiOptionsSchema.extend({
    /**
     * Where `kizuna generate` writes the document. `.json` renders JSON,
     * anything else YAML.
     *
     * @example
     * output: './openapi.yaml',
     */
    output: z.string().optional(),

    /**
     * Where the reference UI is served.
     */
    docsPath: RoutePathSchema.optional(),

    /**
     * Where the document is served. The UI embeds it, so this is only for
     * publishing the file.
     */
    jsonPath: z
        .custom<JsonDocumentPath>((value) => typeof value === 'string' && value.startsWith('/') && value.endsWith('.json'), {
            error: 'must start with / and end in .json',
        })
        .optional(),

    /**
     * Where the document is served as YAML.
     */
    yamlPath: z
        .custom<YamlDocumentPath>((value) => typeof value === 'string' && value.startsWith('/') && value.endsWith('.yaml'), {
            error: 'must start with / and end in .yaml',
        })
        .optional(),

    /**
     * Which API reference UI to render.
     *
     * @default 'scalar'
     */
    provider: z.enum(['scalar', 'swagger']).optional(),

    /**
     * Where to load the UI's assets from, for a self-hosted copy. The script
     * URL for `'scalar'`; the directory holding `swagger-ui.css` and
     * `swagger-ui-bundle.js` for `'swagger'`.
     */
    cdnUrl: z.string().optional(),

    /**
     * The page's `<title>`.
     *
     * @default the document's `info.title`
     */
    pageTitle: z.string().optional(),

    /**
     * Merged into `Scalar.createApiReference` or `SwaggerUIBundle`.
     */
    configuration: z.record(z.string(), z.unknown()).optional(),
});

export type OpenApiPluginProps = z.output<typeof OpenApiPluginOptionsSchema>;

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
 *             docsPath: '/docs',
 *         }),
 *     ],
 * });
 * ```
 */
export const openApiPlugin = definePlugin({
    slug: OPENAPI_PLUGIN_SLUG,
    options: OpenApiPluginOptionsSchema,
    setup: ({ options, api }) => {
        const { output, ...document } = options;

        return {
            routes: openApiRoutes(options, api),
            generators:
                output === undefined
                    ? []
                    : [
                          openApiDocumentGenerator({
                              output,
                              json: output.endsWith('.json'),
                              document,
                          }),
                      ],
        };
    },
});

/**
 * Writes one document, in the format its `output` names.
 */
const openApiDocumentGenerator = defineGenerator({
    options: z.object({
        json: z.boolean(),
        document: z.custom<GenerateOpenApiOptions>(),
    }),
    generate: ({ options, api }) => ({
        finalize: () => {
            const render = renderOpenApi(api, options.document);
            return options.json ? `${JSON.stringify(render('json'), null, 4)}\n` : render('yaml');
        },
    }),
});
