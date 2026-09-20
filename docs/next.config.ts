import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const withMDX = createMDX();

const movedDocs: Array<[string, string]> = [
    ['/docs/building/contract', '/docs/routes'],
    ['/docs/building/router', '/docs/routes'],
    ['/docs/building/mounting', '/docs/config#mounting'],
    ['/docs/plugins', '/docs/config#using-what-a-plugin-offers'],
    ['/docs/reference/k-contract', '/docs/reference/k-routes'],
    ['/docs/reference/k-access-control', '/docs/access-control'],
    ['/docs/reference/kizuna-client', '/docs/reference/create-client'],
    ['/docs/reference/kizuna-identity', '/docs/reference/k-identity'],
    ['/docs/reference/kizuna-request-context', '/docs/reference/k-request-context'],
    ['/docs/reference/kizuna-tags', '/docs/reference/k-tags'],
    ['/docs/reference/kizuna-server', '/docs/reference/define-config'],
    ['/docs/reference/server-api', '/docs/reference/define-config'],
    ['/docs/reference/server-guard', '/docs/reference/k-identity'],
    ['/docs/reference/server-jobs', '/docs/reference/k-jobs'],
    ['/docs/reference/server-request-context', '/docs/reference/k-request-context'],
    ['/docs/reference/server-router', '/docs/routes'],
];

const config: NextConfig = {
    redirects: async () => movedDocs.map(([source, destination]) => ({ source, destination, permanent: true })),
    devIndicators: false,
    serverExternalPackages: ['typescript', 'twoslash'],
    reactStrictMode: true,
    turbopack: {
        rules: {
            '*.svg': {
                loaders: [
                    {
                        loader: '@svgr/webpack',
                        options: {
                            svgo: false,
                        },
                    },
                ],
                as: '*.js',
            },
        },
    },
};

export default withMDX(config);
