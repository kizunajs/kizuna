import { withKizunaCms } from '@kizunajs/cms/next/config';

export default withKizunaCms({
    typedRoutes: true,
    devIndicators: false,
    // `/dev/claude` runs the editor on 127.0.0.1, an origin of its own, as Claude does.
    allowedDevOrigins: ['127.0.0.1'],
    // The Playwright server builds into its own folder, so it runs beside `pnpm dev`.
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
});
