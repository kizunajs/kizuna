import type { z } from 'zod';

// Registry-global, like the CMS's other markers, so a dual ESM/CJS install
// still recognises a relationship.
const RELATIONSHIP: unique symbol = Symbol.for('kizuna.cms.relationship') as symbol as typeof RELATIONSHIP;

/**
 * One row of the editor's picker.
 */
export interface RelationshipOption {
    id: string;
    label: string;
    /**
     * A thumbnail URL.
     */
    image?: string;
}

/**
 * What `options` receives: the editor's search, or the ids a field holds, and
 * the headers of the editor's own request.
 */
export interface RelationshipOptionsInput<Id> {
    /**
     * What the editor typed into the picker.
     */
    query?: string;
    /**
     * The ids to name, for a field that already holds them.
     */
    ids?: Id[];
    /**
     * The editor's `cookie` and `authorization`, so the route sees them.
     */
    headers: Record<string, string>;
}

export interface RelationshipDefinition<Name extends string = string, Id extends z.ZodType = z.ZodType> {
    /**
     * What the relationship is called, in the content overview and `invalidate`.
     */
    name: Name;
    /**
     * The id type a page's fields hold, made with `Kizuna.brand`.
     */
    id: Id;
    /**
     * What the editor's picker lists. A visitor's page never calls it.
     */
    options: (input: RelationshipOptionsInput<z.output<Id>>) => Promise<readonly RelationshipOption[]>;
}

export type CmsRelationship<Name extends string = string, Id extends z.ZodType = z.ZodType> = RelationshipDefinition<Name, Id> & {
    readonly [RELATIONSHIP]: true;
};

/**
 * Something a page holds by id that lives outside the CMS, like a product in
 * your own API, in a shop or in another service. The page fetches whatever it
 * shows of it, and the relationship tells the editor's picker what to list.
 *
 * @example
 * export const Products = defineRelationship({
 *     name: 'products',
 *     id: ProductId,
 *     options: async ({ query, ids, headers }) => {
 *         const result = await apiClient.products.listProductOptions({
 *             query: {
 *                 q: query,
 *                 ids,
 *             },
 *             headers,
 *         });
 *         return result.status === 200 ? result.body.options : [];
 *     },
 * });
 */
export const defineRelationship = <const Name extends string, Id extends z.ZodType>(
    definition: RelationshipDefinition<Name, Id>
): CmsRelationship<Name, Id> => {
    if (!/^[a-z][A-Za-z0-9]*$/.test(definition.name)) {
        throw new Error(`The relationship '${definition.name}' needs a camelCase name, like 'products'.`);
    }
    return {
        ...definition,
        [RELATIONSHIP]: true,
    };
};

export const isRelationship = (value: unknown): value is CmsRelationship =>
    typeof value === 'object' && value !== null && RELATIONSHIP in value;
