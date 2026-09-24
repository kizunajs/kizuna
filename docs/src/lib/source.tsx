import { docs } from 'fumadocs-mdx:collections/server';
import { loader } from 'fumadocs-core/source';
import { Badge, type Stage } from '@/components/shared/badge';

/**
 * Sidebar badges, keyed by page url.
 */
const badges: Record<string, Stage> = {
    '/docs/authentication': 'beta',
    '/docs/access-control': 'alpha',
    '/docs/oauth': 'alpha',
    '/docs/jobs': 'alpha',
    '/docs/caching': 'beta',
    '/docs/mcp': 'beta',
    '/docs/streaming': 'alpha',
    '/docs/tools': 'alpha',
    '/docs/extend/create-adapter': 'beta',
    '/docs/extend/create-generator': 'beta',
    '/docs/extend/create-plugin': 'alpha',
    '/docs/extend/create-job-transport': 'alpha',
    '/docs/extend/create-ts-client': 'beta',
    '/docs/clients/kotlin': 'beta',
    '/docs/clients/tanstack-query': 'beta',
    '/docs/reference/k-identity': 'beta',
    '/docs/reference/kizuna-roles': 'alpha',
    '/docs/reference/kizuna-permissions': 'alpha',
    '/docs/reference/k-jobs': 'alpha',
    '/docs/reference/k-issue': 'beta',
    '/docs/reference/kizuna-tanstack-query': 'beta',
    '/docs/reference/generate-kotlin-client': 'beta',
    '/docs/reference/mcp-plugin': 'beta',
    '/docs/reference/create-mcp-server': 'beta',
};

export const source = loader({
    baseUrl: '/docs',
    source: docs.toFumadocsSource(),
    pageTree: {
        transformers: [
            {
                file(node) {
                    const stage = node.type === 'page' ? badges[node.url] : undefined;
                    if (!stage) return node;

                    return {
                        ...node,
                        name: (
                            <>
                                {node.name}
                                <Badge stage={stage} />
                            </>
                        ),
                    };
                },
            },
        ],
    },
});
