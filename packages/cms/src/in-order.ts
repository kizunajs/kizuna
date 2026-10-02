/**
 * Items in the order their ids are stored, with ids that found nothing left
 * out. For the list a page fetches from its own routes:
 *
 * ```ts
 * const products = inStoredOrder(content.featured, result.body.products, (product) => product.id);
 * ```
 */
export const inStoredOrder = <Item>(ids: readonly string[], items: readonly Item[], idOf: (item: Item) => string): Item[] => {
    const byId = new Map<string, Item>();
    for (const item of items) byId.set(idOf(item), item);
    const ordered: Item[] = [];
    for (const id of ids) {
        const item = byId.get(id);
        if (item !== undefined) ordered.push(item);
    }
    return ordered;
};
