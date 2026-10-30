import type { NextConfig } from 'next';

const config: NextConfig = {
    devIndicators: false,
    allowedDevOrigins: ['*.localhost'],
    // The Playwright server builds into its own folder, so it runs beside `pnpm dev:partner`.
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
