import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { NextConfig } from 'next';
import { defaultPagesOutput, discoverPages, findAppDir, renderPagesModule } from './discovery.js';

export interface WithKizunaCmsOptions {
    /**
     * Where `content.ts` files are looked for. Found on its own when the app
     * has `src/app` or `app`.
     */
    appDir?: string;
    /**
     * Where the pages module is written.
     *
     * @default beside `appDir`, as `cms.pages.ts`
     */
    output?: string;
}

/**
 * Wraps `next.config.ts`: discovers every `content.ts` under `app/` and writes
 * the pages module before Next compiles anything, so the config always imports
 * the pages that exist. Lives in its own entry, because `next.config.ts` runs
 * outside Next's bundler where `next/headers` cannot load.
 *
 * ```ts
 * import { withKizunaCms } from '@kizunajs/cms/next/config';
 *
 * export default withKizunaCms({
 *     typedRoutes: true,
 * });
 * ```
 */
export const withKizunaCms = (nextConfig: NextConfig = {}, options: WithKizunaCmsOptions = {}): NextConfig => {
    const appDir = options.appDir === undefined ? findAppDir() : resolve(process.cwd(), options.appDir);
    if (appDir === undefined) {
        throw new Error('withKizunaCms found no `app` directory. Pass `appDir`.');
    }
    const output = resolve(process.cwd(), options.output ?? defaultPagesOutput(appDir));
    const rendered = renderPagesModule(discoverPages(appDir), output);
    const current = existsSync(output) ? readFileSync(output, 'utf8') : undefined;
    if (current !== rendered) {
        mkdirSync(dirname(output), {
            recursive: true,
        });
        writeFileSync(output, rendered);
    }
    return nextConfig;
};
