import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineView, type ToolView } from 'kizunajs';
import type { ResolvedCmsOptions } from './options.js';

/**
 * Where the host reads the editor from.
 */
export const DOCUMENT_VIEW_URI = 'ui://kizuna-cms/document';

/**
 * What the editor is told about the site when the page is served, in place
 * of {@link CONFIG_PLACEHOLDER}.
 */
export interface DocumentViewConfig {
    /**
     * The site's origin, which the editor frames the draft from and resolves
     * image paths against.
     */
    siteUrl: string | null;
}

/**
 * Where the built page expects its config.
 */
export const CONFIG_PLACEHOLDER = '"__KIZUNA_CMS_VIEW_CONFIG__"';

/**
 * The built editor: beside this module in `dist`, beside `src` when the tests
 * run the source, or wherever the package resolves from the app.
 */
const builtPage = async (): Promise<string> => {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [join(here, 'views/document.html'), join(here, '../dist/views/document.html')];
    try {
        const manifest = createRequire(join(process.cwd(), 'package.json')).resolve('@kizunajs/cms/package.json');
        candidates.push(join(dirname(manifest), 'dist/views/document.html'));
    } catch {
        // Not resolvable from the app, so one of the paths above has it.
    }
    for (const candidate of candidates) {
        try {
            return await readFile(candidate, 'utf8');
        } catch {
            continue;
        }
    }
    throw new Error('The CMS editor is not built. Run `pnpm build` in @kizunajs/cms.');
};

const originOf = (url: string | undefined): string | undefined => {
    if (url === undefined) return undefined;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : undefined;
    } catch {
        return undefined;
    }
};

/**
 * The editor a host renders a draft in, framing the site at `preview.url` and
 * loading images from it or from the media bucket.
 */
export const documentViewFor = (options: Pick<ResolvedCmsOptions, 'preview' | 'media'>): ToolView => {
    const site = originOf(options.preview?.url);
    const bucket = originOf(options.media?.publicPath);
    const images = [...new Set([site, bucket].filter((origin): origin is string => origin !== undefined))];
    const config: DocumentViewConfig = {
        siteUrl: site ?? null,
    };
    return defineView({
        uri: DOCUMENT_VIEW_URI,
        name: 'Content editor',
        description: "A document's fields as a form, with the site's draft beside it.",
        html: async () => (await builtPage()).replace(CONFIG_PLACEHOLDER, JSON.stringify(config)),
        csp: {
            ...(site === undefined
                ? {}
                : {
                      frameDomains: [site],
                  }),
            ...(images.length === 0
                ? {}
                : {
                      resourceDomains: images,
                  }),
        },
        prefersBorder: true,
    });
};
