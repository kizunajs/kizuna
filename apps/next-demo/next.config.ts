import { withKizunaCms } from '@kizunajs/cms/next/config';

export default withKizunaCms({
    typedRoutes: true,
    devIndicators: false,
    // The Playwright server builds into its own folder, so it runs beside `pnpm dev`.
    distDir: process.env.NEXT_DIST_DIR ?? '.next',
});
