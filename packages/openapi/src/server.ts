import type { ApiDefinition } from 'kizunajs';
import { contractOf, rawResponse } from 'kizunajs/adapter';
import type { OpenApiPluginProps } from './plugin.js';
import { renderOpenApi } from './generator.js';
import { renderDocsHtml } from './docs-html.js';

export { generateOpenApi, renderOpenApi } from './generator.js';
export { openApiDocument, type OpenApiDocumentOptions } from './document-target.js';
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
 * What answers the routes `openApiPlugin` declares: the reference UI, and the
 * document itself where the declaration published it.
 */
export const openApiServe = (props: OpenApiPluginProps<string>, api: unknown) => {
    const spec = renderOpenApi(contractOf<ApiDefinition>(api), props);

    return {
        router: {
            page: () =>
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
                ),
            json: () => rawResponse(sent(JSON.stringify(spec('json')), JSON_TYPE)),
            yaml: () => rawResponse(sent(spec('yaml'), YAML)),
        },
    };
};
