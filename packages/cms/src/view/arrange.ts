import type { DescribedField, DescribedLayout } from './schema.js';

/**
 * One thing the form shows: a field, a row or collapsible holding more, or
 * tabs listed one after another, which share a tab bar.
 */
export type Arranged =
    | {
          kind: 'field';
          field: DescribedField;
      }
    | {
          kind: 'row';
          item: DescribedLayout;
          content: Arranged[];
      }
    | {
          kind: 'collapsible';
          item: DescribedLayout;
          content: Arranged[];
      }
    | {
          kind: 'tabs';
          /**
           * The id of the first tab, which the form remembers the shown tab by.
           */
          id: string;
          tabs: Array<{
              item: DescribedLayout;
              content: Arranged[];
          }>;
      };

type Grouped =
    | {
          kind: 'field';
          field: DescribedField;
      }
    | {
          kind: 'group';
          item: DescribedLayout;
          fields: DescribedField[];
      };

/**
 * Builds what the form shows from fields listed in order, each naming the
 * layout items it sits in. The fields of one item are listed together, so a
 * run of fields naming the same item at a depth is that item.
 */
export const arrange = (fields: readonly DescribedField[], layout: readonly DescribedLayout[], depth = 0): Arranged[] => {
    const grouped: Grouped[] = [];
    for (const field of fields) {
        const id = field.layout?.[depth];
        const item = id === undefined ? undefined : layout.find((candidate) => candidate.id === id);
        if (item === undefined) {
            grouped.push({
                kind: 'field',
                field,
            });
            continue;
        }
        const last = grouped.at(-1);
        if (last?.kind === 'group' && last.item.id === item.id) {
            last.fields.push(field);
            continue;
        }
        grouped.push({
            kind: 'group',
            item,
            fields: [field],
        });
    }
    const arranged: Arranged[] = [];
    for (const entry of grouped) {
        if (entry.kind === 'field') {
            arranged.push(entry);
            continue;
        }
        const content = arrange(entry.fields, layout, depth + 1);
        if (entry.item.type === 'row' || entry.item.type === 'collapsible') {
            arranged.push({
                kind: entry.item.type,
                item: entry.item,
                content,
            });
            continue;
        }
        const last = arranged.at(-1);
        if (last?.kind === 'tabs') {
            last.tabs.push({
                item: entry.item,
                content,
            });
            continue;
        }
        arranged.push({
            kind: 'tabs',
            id: entry.item.id,
            tabs: [
                {
                    item: entry.item,
                    content,
                },
            ],
        });
    }
    return arranged;
};

/**
 * Whether an outermost item belongs in the sidebar.
 */
export const inSidebar = (entry: Arranged): boolean =>
    entry.kind === 'field' ? entry.field.position === 'sidebar' : entry.kind === 'collapsible' && entry.item.position === 'sidebar';

/**
 * Each tab's id to the id of the tabs it is one of, for every tab in the
 * arranged items and inside them.
 */
export const tabSets = (arranged: readonly Arranged[], into = new Map<string, string>()): Map<string, string> => {
    for (const entry of arranged) {
        if (entry.kind === 'row' || entry.kind === 'collapsible') tabSets(entry.content, into);
        if (entry.kind !== 'tabs') continue;
        for (const tab of entry.tabs) {
            into.set(tab.item.id, entry.id);
            tabSets(tab.content, into);
        }
    }
    return into;
};
