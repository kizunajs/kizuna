import type { ClientTarget, Contract } from '@ts-kizuna/core';
import { generateOpenApi } from './generator.js';
import type { GenerateOpenApiOptions } from './types.js';

/**
 * Where the generated OpenAPI document is written. The format follows the
 * output extension: `.json` renders JSON, anything else renders YAML.
 */
export interface OpenApiDocumentOptions extends Partial<GenerateOpenApiOptions> {
    /**
     * Path the generated document is written to.
     */
    output: string;
}

/**
 * An OpenAPI document target for `kizuna.config.ts`.
 *
 * @example
 * openApiDocument({ output: './openapi.yaml' });
 */
export const openApiDocument = ({ output, ...overrides }: OpenApiDocumentOptions): ClientTarget => ({
    kind: 'openapi',
    output,
    generate: (contract: Contract) => {
        const render = generateOpenApi(contract, overrides);
        return output.endsWith('.json') ? `${JSON.stringify(render('json'), null, 4)}\n` : render('yaml');
    },
});
