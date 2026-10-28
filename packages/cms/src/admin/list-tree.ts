/**
 * What the tree needs of an item: its id, the id of the item above, and its
 * own label.
 */
export interface TreePlace {
    id: string;
    parent: string | null;
    label: string;
}

/**
 * One line of the tree as the list shows it.
 */
export interface TreeLine<Row> {
    row: Row;
    depth: number;
    hasChildren: boolean;
    expanded: boolean;
}

/**
 * The rows in tree order, each under its parent, leaving out the rows under
 * a collapsed one. Rows keep the order they arrive in among their siblings.
 * A row whose parent is missing, or that sits in a loop, shows at the top.
 */
export const treeLinesOf = <Row extends { tree?: TreePlace | undefined }>(
    rows: readonly Row[],
    collapsed: ReadonlySet<string>
): Array<TreeLine<Row>> => {
    const placed = rows.filter((row) => row.tree !== undefined);
    const ids = new Set(placed.map((row) => row.tree!.id));
    const children = new Map<string, Row[]>();
    for (const row of placed) {
        const parent = row.tree!.parent;
        if (parent !== null && ids.has(parent) && parent !== row.tree!.id) children.set(parent, [...(children.get(parent) ?? []), row]);
    }
    const lines: Array<TreeLine<Row>> = [];
    const visited = new Set<string>();
    const visit = (row: Row, depth: number, shown: boolean): void => {
        const id = row.tree!.id;
        if (visited.has(id)) return;
        visited.add(id);
        const below = (children.get(id) ?? []).filter((child) => !visited.has(child.tree!.id));
        const expanded = !collapsed.has(id);
        if (shown) {
            lines.push({
                row,
                depth,
                hasChildren: below.length > 0,
                expanded,
            });
        }
        for (const child of below) visit(child, depth + 1, shown && expanded);
    };
    for (const row of placed) {
        const parent = row.tree!.parent;
        if (parent === null || !ids.has(parent) || parent === row.tree!.id) visit(row, 0, true);
    }
    // Rows in a loop never hang from the top, so each starts one of its own.
    for (const row of placed) visit(row, 0, true);
    return lines;
};

/**
 * The parent a drop gives the dragged item: the row it lands on, or `null`
 * for the top. `undefined` when the drop changes nothing.
 */
export const parentAfterDrop = (dragged: TreePlace, target: TreePlace | null): string | null | undefined => {
    const parent = target === null ? null : target.id;
    if (parent === dragged.id || parent === dragged.parent) return undefined;
    return parent;
};

/**
 * The draft change that puts an item under a parent, or at the top with
 * `null`, which empties the field.
 */
export const parentChange = (field: string, parent: string | null): Record<string, string | null> => ({
    [field]: parent,
});
