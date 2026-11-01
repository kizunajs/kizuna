import { z } from 'zod';
import type { CmsService, DraftState } from './cms.js';
import { defineGlobal } from './definitions.js';
import { DEFAULT_SITE, sitesOf, type CmsPluginOptions } from './options.js';

/**
 * A global admins fill in for a site, holding what an agent reads before it
 * writes anything there, after the content's own `instructions`. Add it to a
 * site's `globals`, or to the shared `globals` for every site.
 *
 * @example
 * globals: [PrivacyPolicy, AgentInstructions],
 */
export const AgentInstructions = defineGlobal({
    name: 'agentInstructions',
    label: 'Agent instructions',
    fields: [
        {
            name: 'instructions',
            schema: z.string().max(8000).default(''),
            description: 'Markdown an agent reads before it writes on this site: its voice, and what never to change.',
        },
    ],
});

interface Instructed {
    name: string;
    label?: string;
    instructions?: string;
}

/**
 * The instructions of each kind of content, for the editing tools'
 * descriptions: every page, global and collection that declares them.
 */
export const declaredInstructions = (
    options: CmsPluginOptions
): { pages: Instructed[]; globals: Instructed[]; collections: Instructed[] } => {
    const sites = Object.values(options.sites?.entries ?? {});
    const pages = Object.values(sitesOf(options)).flatMap((site) => Object.values(site.pages).map((entry) => entry.page));
    const unique = (definitions: readonly Instructed[]): Instructed[] => [
        ...new Map(
            definitions.filter((definition) => definition.instructions !== undefined).map((definition) => [definition.name, definition])
        ).values(),
    ];
    return {
        pages: unique(pages),
        globals: unique([...(options.globals ?? []), ...sites.flatMap((site) => site.globals ?? [])]),
        collections: unique([...(options.collections ?? []), ...sites.flatMap((site) => site.collections ?? [])]),
    };
};

/**
 * The instructions as a tool description reads them, after what the tool
 * does. Nothing when no content of the kind declares any.
 */
export const instructionsSection = (definitions: readonly Instructed[]): string =>
    definitions.length === 0
        ? ''
        : `\n\nFollow the content's own instructions when you write it:\n\n${definitions
              .map((definition) => `### ${definition.label ?? definition.name} (${definition.name})\n\n${definition.instructions!.trim()}`)
              .join('\n\n')}`;

/**
 * The published `instructions` of the {@link AgentInstructions} global on a
 * site, or nothing when the site has none.
 */
const siteInstructionsOn = async (cms: CmsService, site: string): Promise<string | undefined> => {
    try {
        const { row } = await cms.document({
            type: 'global',
            name: AgentInstructions.name,
            ...(site === DEFAULT_SITE
                ? {}
                : {
                      site,
                  }),
        });
        const text = row?.published?.['instructions'];
        return typeof text === 'string' && text.trim() !== '' ? text.trim() : undefined;
    } catch {
        // The site does not have the global.
        return undefined;
    }
};

/**
 * What an agent reads before it writes a document: its content's own
 * instructions, then what admins wrote for its site in the
 * {@link AgentInstructions} global, the site's own before the shared one.
 * `site` names the site for shared content, which every site may show.
 */
export const instructionsOf = async (cms: CmsService, state: DraftState, site?: string): Promise<string | null> => {
    const own = state.target.definition.instructions?.trim();
    const where = state.target.site !== DEFAULT_SITE ? state.target.site : site;
    const forSite =
        (where === undefined ? undefined : await siteInstructionsOn(cms, where)) ?? (await siteInstructionsOn(cms, DEFAULT_SITE));
    const parts = [own, forSite].filter((part): part is string => part !== undefined && part !== '');
    return parts.length === 0 ? null : parts.join('\n\n');
};
