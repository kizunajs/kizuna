import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineMcpView, type ToolView } from 'kizunajs';
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
 * Where the built page takes the app's own stylesheet, after its own styles.
 */
export const STYLESHEET_PLACEHOLDER = '<!--kizuna-cms-stylesheet-->';

const attribute = (value: string): string =>
    value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/**
 * The page with a link to `adminCss` where its placeholder is, or without one.
 * Its rules sit outside the `kizuna` layer the page's own styles are in, so
 * they win.
 */
export const withStylesheet = (page: string, href: string | undefined): string =>
    page.replace(STYLESHEET_PLACEHOLDER, () => (href === undefined ? '' : `<link rel="stylesheet" href="${attribute(href)}">`));

/**
 * A file the package build writes to `dist/views`: beside this module in
 * `dist`, beside `src` when the tests run the source, or wherever the package
 * resolves from the app.
 */
export const readBuilt = async (name: string): Promise<string> => {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [join(here, 'views', name), join(here, '../dist/views', name)];
    try {
        const entry = createRequire(join(process.cwd(), 'package.json')).resolve('@kizunajs/cms');
        candidates.push(join(dirname(entry), 'views', name));
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
    throw new Error(`The CMS editor is not built (no views/${name}). Run \`pnpm build\` in @kizunajs/cms.`);
};

const builtPage = (): Promise<string> => readBuilt('document.html');

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
 * `adminCss` as an address the host can load: a path resolved against the
 * site, which a path cannot reach without.
 */
const stylesheetOn = (href: string | undefined, site: string | undefined): string | undefined => {
    if (href === undefined) return undefined;
    try {
        return new URL(href, site).toString();
    } catch {
        return undefined;
    }
};

/**
 * The editor a host renders a draft in, framing the site at `preview.url` and
 * loading images from it, the media bucket, and the origins relationships
 * name for their thumbnails.
 */
export const documentViewFor = (options: {
    preview?: ResolvedCmsOptions['preview'];
    adminCss?: string;
    media?: ResolvedCmsOptions['media'];
    relationships?: readonly { imageOrigins?: readonly string[] }[];
    auth?: {
        people?: {
            imageOrigins?: readonly string[];
        };
    };
}): ToolView => {
    const site = originOf(options.preview?.url);
    const bucket = originOf(options.media?.publicPath);
    const thumbnails = (options.relationships ?? []).flatMap((relationship) => relationship.imageOrigins ?? []);
    const faces = options.auth?.people?.imageOrigins ?? [];
    // The host serves the view from an origin of its own, so a stylesheet on the site loads from the site's.
    const stylesheet = stylesheetOn(options.adminCss, site);
    const images = [
        ...new Set(
            [site, bucket, ...thumbnails, ...faces, originOf(stylesheet)].filter((origin): origin is string => origin !== undefined)
        ),
    ];
    const config: DocumentViewConfig = {
        siteUrl: site ?? null,
    };
    return defineMcpView({
        uri: DOCUMENT_VIEW_URI,
        name: 'Content editor',
        description: "A document's fields as a form, with the site's draft beside it.",
        html: async () => withStylesheet((await builtPage()).replace(CONFIG_PLACEHOLDER, JSON.stringify(config)), stylesheet),
        csp: {
            ...(site === undefined
                ? {}
                : {
                      frameDomains: [site],
                      connectDomains: [site],
                      baseUriDomains: [site],
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
