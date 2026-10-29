import { labelOf, type DescribedField, type DescribedLayout } from '../view/schema.js';

/**
 * Entries listed under the tab of the form they sit in, in the order the
 * form shows them.
 */
export interface Section<Entry> {
    /**
     * The tab's label, or empty for fields no tab holds.
     */
    title: string;
    entries: Entry[];
}

const outermostOf = (fields: readonly DescribedField[], field: DescribedField): DescribedField => {
    let current = field;
    const seen = new Set<string>();
    while (current.parent !== undefined && !seen.has(current.path)) {
        seen.add(current.path);
        const parent = fields.find((candidate) => candidate.path === current.parent);
        if (parent === undefined) break;
        current = parent;
    }
    return current;
};

/**
 * The label of the tab a field sits in, through the field holding it, or
 * empty when no tab holds it.
 */
export const sectionTitleOf = (fields: readonly DescribedField[], layout: readonly DescribedLayout[], path: string): string => {
    const field = fields.find((candidate) => candidate.path === path);
    if (field === undefined) return '';
    const tab = (outermostOf(fields, field).layout ?? [])
        .map((id) => layout.find((item) => item.id === id))
        .find((item) => item?.type === 'tab');
    return tab?.label ?? '';
};

/**
 * What a field is called under its section. A field inside another one
 * names that one too, unless it is the only field its tab holds, like a
 * hero block alone on the Hero tab.
 */
export const sectionLabelOf = (
    fields: readonly DescribedField[],
    layout: readonly DescribedLayout[],
    path: string,
    fallback: string
): string => {
    const field = fields.find((candidate) => candidate.path === path);
    if (field === undefined) return fallback;
    const parent = field.parent === undefined ? undefined : fields.find((candidate) => candidate.path === field.parent);
    if (parent === undefined) return labelOf(field);
    const title = sectionTitleOf(fields, layout, path);
    const alone =
        title !== '' &&
        fields.filter((candidate) => candidate.parent === undefined && sectionTitleOf(fields, layout, candidate.path) === title).length ===
            1;
    return alone || labelOf(parent).toLowerCase() === title.toLowerCase() ? labelOf(field) : `${labelOf(parent)}, ${labelOf(field)}`;
};

/**
 * Entries grouped by the section each one names, the sections in the order
 * their first entry comes.
 */
export const sectionsOf = <Entry>(entries: readonly Entry[], titleOf: (entry: Entry) => string): Section<Entry>[] => {
    const sections: Section<Entry>[] = [];
    for (const entry of entries) {
        const title = titleOf(entry);
        const section = sections.find((candidate) => candidate.title === title);
        if (section === undefined) {
            sections.push({
                title,
                entries: [entry],
            });
        } else {
            section.entries.push(entry);
        }
    }
    return sections;
};

/**
 * Names in a sentence, joined by `and` or `or`: "Hero", "Hero and Products",
 * "Hero, Products and SEO".
 */
export const sentenceOf = (names: readonly string[], joiner: 'and' | 'or' = 'and'): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${joiner} ${names.at(-1)!}`;
