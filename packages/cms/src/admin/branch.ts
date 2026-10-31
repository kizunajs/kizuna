/**
 * What Delete asks first when the items going have items under them, which go
 * with them: the titles of the ticked items, and of what sits under them.
 * `undefined` when nothing sits under them, to ask as any delete does.
 */
export const branchQuestionOf = (going: readonly string[], under: readonly string[]): string | undefined => {
    if (under.length === 0) return undefined;
    const items = (count: number): string => `${count} ${count === 1 ? 'item' : 'items'}`;
    const named =
        under.length <= 3
            ? `${new Intl.ListFormat('en').format(under)} go${under.length === 1 ? 'es' : ''} with ${going.length === 1 ? 'it' : 'them'}. `
            : '';
    return going.length === 1
        ? `Delete ${going[0]} and the ${items(under.length)} under it, with their history? ${named}Pages that show them stop showing them.`
        : `Delete ${items(going.length)} and the ${items(under.length)} under them, with their history? ${named}Pages that show them stop showing them.`;
};

/**
 * The items under one in a tree, at any depth, by their parents.
 */
export const itemsUnder = <Item extends { id: string; parent?: string | null | undefined }>(items: readonly Item[], id: string): Item[] => {
    const found: Item[] = [];
    const waiting = [id];
    const seen = new Set([id]);
    while (waiting.length > 0) {
        const parent = waiting.shift();
        for (const item of items) {
            if (item.parent !== parent || seen.has(item.id)) continue;
            seen.add(item.id);
            found.push(item);
            waiting.push(item.id);
        }
    }
    return found;
};
