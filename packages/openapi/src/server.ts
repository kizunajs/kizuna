import { z } from 'zod';
import type { ApiDefinition } from 'kizunajs';
import { contractOf, rawResponse } from 'kizunajs/adapter';
import { route, type PluginApi, type PluginRoutes } from 'kizunajs/plugin';
import type { OpenApiPluginProps } from './plugin.js';
import { renderOpenApi } from './generator.js';
import { renderDocsHtml } from './docs-html.js';
import type { OpenApiRenderer } from './types.js';

export { generateOpenApi, renderOpenApi } from './generator.js';
export { renderDocsHtml, type DocsProvider, type DocsHtmlOptions } from './docs-html.js';
const HTML = 'text/html; charset=utf-8';
const JSON_TYPE = 'application/json';
const YAML = 'text/yaml; charset=utf-8';

const sent = (body: string, contentType: string): Response =>
    new Response(body, {
        status: 200,
        headers: {
            'content-type': contentType,
        },
    });

/**
 * The routes `openApiPlugin` serves: the reference UI, and the document itself
 * where the options publish it. The document is rendered on the first request,
 * once the api it describes has assembled.
 */
export const openApiRoutes = (props: OpenApiPluginProps, api: PluginApi): PluginRoutes => {
    let renderer: ReturnType<typeof renderOpenApi> | undefined;
    const spec: OpenApiRenderer = ((format: 'json' | 'yaml') => {
        renderer ??= renderOpenApi(contractOf<ApiDefinition>(api), props);
        return renderer(format as never);
    }) as OpenApiRenderer;

    const routes: PluginRoutes = {};
    if (props.docsPath !== undefined) {
        routes.page = route({
            method: 'GET',
            path: props.docsPath,
            summary: 'API reference',
            responses: {
                200: z.string(),
            },
        }).handler(() =>
            rawResponse(
                sent(
                    renderDocsHtml({
                        specUrl: props.jsonPath,
                        specContent: props.jsonPath === undefined ? spec('json') : undefined,
                        provider: props.provider,
                        pageTitle: props.pageTitle ?? spec('json').info.title,
                        cdnUrl: props.cdnUrl,
                        configuration: props.configuration,
                    }),
                    HTML
                )
            )
        );
    }
    if (props.jsonPath !== undefined) {
        routes.json = route({
            method: 'GET',
            path: props.jsonPath,
            summary: 'OpenAPI document',
            responses: {
                200: z.unknown(),
            },
        }).handler(() => rawResponse(sent(JSON.stringify(spec('json')), JSON_TYPE)));
    }
    if (props.yamlPath !== undefined) {
        routes.yaml = route({
            method: 'GET',
            path: props.yamlPath,
            summary: 'OpenAPI document, as YAML',
            responses: {
                200: z.string(),
            },
        }).handler(() => rawResponse(sent(spec('yaml'), YAML)));
    }
    return routes;
};
