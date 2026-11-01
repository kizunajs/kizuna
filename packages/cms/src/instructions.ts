import type { DraftState } from './cms.js';
import { sitesOf, type CmsPluginOptions } from './options.js';

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
 * What an agent reads before it writes a document: its content's own
 * instructions. How a site sounds and which words it uses is its voice.
 */
export const instructionsOf = (state: DraftState): string | null => {
    const own = state.target.definition.instructions?.trim();
    return own === undefined || own === '' ? null : own;
};
