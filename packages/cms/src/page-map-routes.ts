import { z } from 'zod';
import { Kizuna, type RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import type { CmsService } from './cms.js';
import type { Guarded } from './action-routes.js';
import { pageMapOf, type PageMap } from './page-map.js';
import { PageStatusSchema } from './wire.js';
import { parseRef } from './refs.js';
import { documentLabel } from './reviews.js';
import type { LinkTargetStatus } from './link-targets.js';

export const PageMapSchema = Kizuna.model({
    title: 'CMS.PageMap',
    schema: z.object({
        nodes: z.array(
            z.object({
                id: z
                    .string()
                    .describe('Unique on the map. Links name documents by `ref`, and an item shown on several sites has a node on each.'),
                ref: z.string().nullable().describe('The document, or null for a route that shows a collection, like /shops/[slug].'),
                kind: z
                    .enum(['page', 'item', 'collection', 'document'])
                    .describe(
                        'A page, an item a page shows at its address, the route that shows those items, or another document that holds or receives a link, like the footer.'
                    ),
                site: z.string().nullable().describe('The site it belongs to, or null for the shared content.'),
                title: z.string(),
                path: z.string().nullable(),
                status: z
                    .union([PageStatusSchema, z.enum(['trashed', 'missing'])])
                    .describe('`trashed` for a link target in the trash, `missing` for one that is gone.'),
                collection: z.string().optional().describe('For an item, the `id` of the route that shows it.'),
                count: z.int().optional().describe('For a route that shows a collection, how many items it shows.'),
            })
        ),
        links: z.array(
            z.object({
                from: z.string().describe('The ref of the document holding the link.'),
                to: z.string().describe('The ref of the document it links to.'),
                fieldPaths: z.array(z.string()).describe('Where in the holder the link sits, like `body.2.markDefs.0`.'),
                published: z.boolean().describe("Whether the holder's published content holds the link, not only its draft."),
                broken: z.boolean().describe('Whether the target is not live: never published, in the trash, or gone.'),
            })
        ),
    }),
});

/**
 * The group's pages and the links between them, for the sites the caller
 * may open.
 */
export const readPageMap = async (cms: CmsService, sees: (site: string | undefined) => boolean): Promise<PageMap> => {
    const [pages, links] = await Promise.all([cms.summaries(), cms.contentLinks()]);
    // A page is named by its definition, so only items and linked documents need looking up.
    const items = pages.filter((page) => page.ref.startsWith('item:')).map((page) => page.ref);
    const refs = [...new Set([...items, ...links.flatMap((link) => [link.from, link.to])])];
    const globals = refs.filter((ref) => parseRef(ref)?.type === 'global');
    const targets = await cms.linkTargets({
        refs: refs.filter((ref) => !globals.includes(ref)),
    });
    // A global holds links but is never one's target, so it is described from its draft.
    const described: Array<{ ref: string; label: string; path: null; status: LinkTargetStatus }> = [];
    for (const ref of globals) {
        try {
            const state = await cms.draftState(parseRef(ref)!);
            described.push({
                ref,
                label: documentLabel(state),
                path: null,
                status: state.status === 'published' || state.status === 'changed' ? 'published' : 'unpublished',
            });
        } catch {
            // A global the config no longer declares shows by its ref, as missing.
        }
    }
    return pageMapOf({
        pages,
        collectionPages: cms.collectionPages(),
        links,
        targets: new Map([...targets, ...described].map((target) => [target.ref, target])),
        sees,
    });
};

/**
 * One call for the whole map: every page by its path, the routes that show
 * collections with their items, and every content link between them.
 */
export const pageMapRoute = (input: { editor: RouteAuth; editingBase: `/${string}`; guarded: Guarded }) =>
    route({
        method: 'GET',
        path: `${input.editingBase}/map`,
        auth: input.editor,
        summary: 'Map every page and the content links between them',
        description:
            "Every page of the sites you may open and the shared content, with each route that shows a collection, its items, and every content link between documents, across sites. A page's parent is the page whose path its own extends. `broken` marks a link to a target that is not live.",
        tool: true,
        responses: {
            200: {
                body: PageMapSchema,
                cache: 'no-store',
            },
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const access = cms.access(args.auth);
            return {
                status: 200,
                body: await readPageMap(cms, (site) => access.sees(site)),
            };
        }) as never
    );
