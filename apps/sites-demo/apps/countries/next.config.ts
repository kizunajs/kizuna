import type { NextConfig } from 'next';

const config: NextConfig = {
    typedRoutes: true,
    devIndicators: false,
    transpilePackages: ['@kizunajs-demo/sites-content', '@kizunajs-demo/sites-ui'],
    // Each site is served at its own name under localhost, like group.localhost.
    allowedDevOrigins: ['*.localhost'],
    // The Playwright server builds into its own folder, so it runs beside `pnpm dev`.
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
