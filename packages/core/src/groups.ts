export interface GroupOptions {
    /**
     * The group's name in the docs. Unique among its siblings.
     */
    title: string;
    /**
     * Shown beside the group in the OpenAPI document.
     */
    description?: string;
    /**
     * External documentation for the group.
     */
    externalDocs?: {
        url: string;
        description?: string;
    };
    /**
     * The groups nested under this one.
     */
    groups?: Record<string, GroupOptions | string>;
}

/**
 * A declared group, with its place in the tree.
 */
export interface ResolvedGroup {
    /**
     * Its dotted path, `'workspace.members'`.
     */
    readonly path: string;
    readonly title: string;
    readonly description?: string;
    readonly externalDocs?: GroupOptions['externalDocs'];
    /**
     * Dotted paths from the top group down to this one.
     */
    readonly lineage: readonly string[];
}

/**
 * The groups from `k.groups`.
 */
export interface GroupSet<Declared extends Record<string, GroupOptions | string> = Record<string, GroupOptions | string>> {
    readonly __brand: 'GroupSet';
    /**
     * The tree as written, for its type.
     */
    readonly declared: Declared;
    /**
     * Every group by dotted path, parents first.
     */
    readonly groups: ReadonlyMap<string, ResolvedGroup>;
}

/**
 * Every dotted path a `k.groups` input declares.
 */
export type GroupPaths<Declared> = {
    [Key in Extract<keyof Declared, string>]:
        | Key
        | (Declared[Key] extends { groups: infer Nested } ? `${Key}.${GroupPaths<Nested>}` : never);
}[Extract<keyof Declared, string>];

/**
 * The dotted group paths a {@link GroupSet} declares.
 */
export type GroupPathsOf<Set extends GroupSet> = Set extends GroupSet<infer Declared> ? GroupPaths<Declared> : never;

export const isGroupSet = (value: unknown): value is GroupSet =>
    typeof value === 'object' && value !== null && '__brand' in value && (value as GroupSet).__brand === 'GroupSet';

const collect = (declared: Record<string, GroupOptions | string>, ancestors: readonly string[], into: Map<string, ResolvedGroup>): void => {
    for (const [key, value] of Object.entries(declared)) {
        if (key.includes('.')) {
            throw new Error(`The group "${key}" has a dot in its key. Nest it under \`groups\` instead.`);
        }
        const options = typeof value === 'string' ? { title: value } : value;
        const parent = ancestors[ancestors.length - 1];
        const path = parent === undefined ? key : `${parent}.${key}`;
        const lineage = [...ancestors, path];
        into.set(path, {
            path,
            title: options.title,
            ...(options.description === undefined
                ? {}
                : {
                      description: options.description,
                  }),
            ...(options.externalDocs === undefined
                ? {}
                : {
                      externalDocs: options.externalDocs,
                  }),
            lineage,
        });
        if (options.groups) collect(options.groups, lineage, into);
    }
};

/**
 * Throw on two siblings with one title.
 */
const assertUniqueTitles = (groups: ReadonlyMap<string, ResolvedGroup>): void => {
    const owners = new Map<string, string>();
    for (const group of groups.values()) {
        const parent = group.lineage[group.lineage.length - 2] ?? '';
        const sibling = `${parent}\u0000${group.title}`;
        const owner = owners.get(sibling);
        if (owner !== undefined) {
            throw new Error(`The groups "${owner}" and "${group.path}" share the title "${group.title}". Give each group its own title.`);
        }
        owners.set(sibling, group.path);
    }
};

/**
 * Declare the groups routes are filed under. A string is shorthand for
 * `{ title }`.
 *
 * @example
 * const groups = k.groups({
 *     workspace: {
 *         title: 'Workspace',
 *         groups: {
 *             members: 'Members',
 *         },
 *     },
 *     health: 'Health',
 * });
 */
export const createGroups = <const Declared extends Record<string, GroupOptions | string>>(declared: Declared): GroupSet<Declared> => {
    const groups = new Map<string, ResolvedGroup>();
    collect(declared, [], groups);
    assertUniqueTitles(groups);
    return {
        __brand: 'GroupSet',
        declared,
        groups,
    };
};
