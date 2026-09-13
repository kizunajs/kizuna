import { z } from 'zod';

/**
 * Every permission an API has, grouped by what it acts on.
 */
export type PermissionCatalog = Record<string, readonly string[]>;

/**
 * A permission name, `'workspace:delete'`.
 */
export type PermissionName<Catalog extends PermissionCatalog> = {
    [Resource in keyof Catalog & string]: `${Resource}:${Catalog[Resource][number]}`;
}[keyof Catalog & string];

/**
 * A subset of the catalog: what a role holds, or what a route requires.
 */
export type PermissionSet<Catalog extends PermissionCatalog> = {
    readonly [Resource in keyof Catalog]?: readonly Catalog[Resource][number][];
};

/**
 * What one role holds, or `'all'`.
 */
export type RoleDefinition<Catalog extends PermissionCatalog> = PermissionSet<Catalog> | 'all';

/**
 * The roles callers hold, declared with `Kizuna.roles`: a list of names, or
 * names built from a permission catalog.
 */
export interface Roles<Catalog extends PermissionCatalog | undefined = PermissionCatalog | undefined, Name extends string = string> {
    readonly __brand: 'Roles';
    /**
     * The catalog the roles are built from, or `undefined` for plain names.
     */
    readonly permissions: Catalog extends PermissionCatalog ? Permissions<Catalog> : undefined;
    /**
     * Each role and what it holds, as declared, or `undefined` for plain names.
     */
    readonly definitions: Catalog extends PermissionCatalog ? Readonly<Record<Name, RoleDefinition<Catalog>>> : undefined;
    /**
     * The role names, in declaration order.
     */
    readonly names: readonly Name[];
    /**
     * A zod enum of the role names.
     */
    readonly schema: z.ZodEnum<{ [Each in Name]: Each }>;
    /**
     * What one role holds, or the union for several. Empty for plain names.
     */
    of(role: Name | readonly Name[]): Catalog extends PermissionCatalog ? PermissionName<Catalog>[] : never[];
    /**
     * Whether the role holds every permission in `requires`.
     */
    holds(role: Name | readonly Name[], requires: Catalog extends PermissionCatalog ? PermissionSet<Catalog> : never): boolean;
}

/**
 * A permission catalog, declared with `Kizuna.permissions`.
 */
export interface Permissions<Catalog extends PermissionCatalog = PermissionCatalog> {
    readonly __brand: 'Permissions';
    /**
     * The catalog as declared.
     */
    readonly catalog: Catalog;
    /**
     * Every permission as `resource:verb`.
     */
    readonly names: readonly PermissionName<Catalog>[];
    /**
     * A zod enum of every permission name.
     */
    readonly schema: z.ZodEnum<{ [Name in PermissionName<Catalog>]: Name }>;
}

/**
 * The names of the roles a {@link Roles} declares.
 */
export type RoleNamesOf<R> = R extends Roles<PermissionCatalog | undefined, infer Name> ? Name : never;

/**
 * The catalog behind a {@link Roles} or a {@link Permissions}.
 */
export type CatalogOf<Source> =
    Source extends Roles<infer Catalog, string>
        ? Catalog extends PermissionCatalog
            ? Catalog
            : never
        : Source extends Permissions<infer Catalog>
          ? Catalog
          : never;

/**
 * The permission names behind a {@link Roles} built from a catalog.
 */
export type GrantNamesOf<Source> = PermissionName<CatalogOf<Source>>;

export const isPermissions = (value: unknown): value is Permissions =>
    typeof value === 'object' && value !== null && '__brand' in value && (value as Permissions).__brand === 'Permissions';

export const isRoles = (value: unknown): value is Roles =>
    typeof value === 'object' && value !== null && '__brand' in value && (value as Roles).__brand === 'Roles';

/**
 * Flatten a subset of a catalog to `resource:verb` names.
 */
export const permissionNames = (set: Readonly<Record<string, readonly string[] | undefined>>): string[] => {
    const names: string[] = [];
    for (const [resource, verbs] of Object.entries(set)) {
        for (const verb of verbs ?? []) names.push(`${resource}:${verb}`);
    }
    return names;
};

const assertInCatalog = (catalog: PermissionCatalog, set: Readonly<Record<string, readonly string[] | undefined>>, label: string): void => {
    for (const [resource, verbs] of Object.entries(set)) {
        const declared = catalog[resource];
        if (declared === undefined) {
            throw new Error(`${label} names '${resource}', which the permissions do not declare.`);
        }
        for (const verb of verbs ?? []) {
            if (!declared.includes(verb)) {
                throw new Error(`${label} names '${resource}:${verb}', which the permissions do not declare.`);
            }
        }
    }
};

const toList = <Name extends string>(role: Name | readonly Name[]): readonly Name[] => (typeof role === 'string' ? [role] : role);

/**
 * Declare the roles callers hold: a list of names, or names built from a
 * permission catalog, where `'all'` is every permission declared.
 *
 * @example
 * export const roles = Kizuna.roles(['admin', 'owner']);
 *
 * export const roles = Kizuna.roles(permissions, {
 *     admin: {
 *         workspace: ['read'],
 *         invite: ['send', 'cancel'],
 *     },
 *     owner: 'all',
 * });
 */
export function createRoles<const Name extends string>(names: readonly Name[]): Roles<undefined, Name>;
export function createRoles<Catalog extends PermissionCatalog, const Definitions extends Record<string, RoleDefinition<Catalog>>>(
    permissions: Permissions<Catalog>,
    definitions: Definitions
): Roles<Catalog, keyof Definitions & string>;
export function createRoles(
    source: readonly string[] | Permissions,
    definitions?: Record<string, RoleDefinition<PermissionCatalog>>
): Roles<PermissionCatalog | undefined, string> {
    const permissions = isPermissions(source) ? source : undefined;
    const names = permissions === undefined ? [...(source as readonly string[])] : Object.keys(definitions ?? {});
    if (names.length === 0) {
        throw new Error('Kizuna.roles needs at least one role.');
    }
    const held = new Map<string, Set<string>>();
    for (const name of names) {
        const definition = definitions?.[name];
        if (permissions === undefined || definition === undefined) {
            held.set(name, new Set());
            continue;
        }
        if (definition === 'all') {
            held.set(name, new Set(permissions.names));
            continue;
        }
        assertInCatalog(permissions.catalog, definition as Record<string, readonly string[] | undefined>, `Role '${name}'`);
        held.set(name, new Set(permissionNames(definition as Record<string, readonly string[] | undefined>)));
    }

    const heldBy = (role: string | readonly string[]): Set<string> => {
        const union = new Set<string>();
        for (const name of toList(role)) {
            const permissionsOfRole = held.get(name);
            if (permissionsOfRole === undefined) {
                throw new Error(`Role '${name}' is not one of the roles declared: ${names.join(', ')}.`);
            }
            for (const permission of permissionsOfRole) union.add(permission);
        }
        return union;
    };

    return {
        __brand: 'Roles',
        permissions,
        definitions: permissions === undefined ? undefined : definitions,
        names,
        schema: z.enum(names as [string, ...string[]]),
        of: (role: string | readonly string[]) => [...heldBy(role)],
        holds: (role: string | readonly string[], requires: PermissionSet<PermissionCatalog>) => {
            const union = heldBy(role);
            return permissionNames(requires as Record<string, readonly string[] | undefined>).every((permission) => union.has(permission));
        },
    } as unknown as Roles<PermissionCatalog | undefined, string>;
}

/**
 * Declare every permission an API has, grouped by what it acts on.
 *
 * @example
 * export const permissions = Kizuna.permissions({
 *     workspace: ['read', 'delete', 'transfer'],
 *     invite: ['send', 'cancel'],
 * });
 */
export const createPermissions = <const Catalog extends PermissionCatalog>(catalog: Catalog): Permissions<Catalog> => {
    const resources = Object.keys(catalog);
    if (resources.length === 0) {
        throw new Error('Kizuna.permissions needs at least one entry.');
    }
    for (const resource of resources) {
        if (resource.includes(':')) {
            throw new Error(`Permission key '${resource}' cannot contain ':'. It separates the key from the verb in a permission name.`);
        }
        const verbs = catalog[resource] ?? [];
        if (verbs.length === 0) {
            throw new Error(`Permission key '${resource}' lists no verbs.`);
        }
        for (const verb of verbs) {
            if (verb.includes(':')) {
                throw new Error(`Permission '${resource}:${verb}' cannot contain ':' in the verb.`);
            }
        }
    }
    const names = permissionNames(catalog) as PermissionName<Catalog>[];
    const permissions: Permissions<Catalog> = {
        __brand: 'Permissions',
        catalog,
        names,
        schema: z.enum(names as [PermissionName<Catalog>, ...PermissionName<Catalog>[]]) as Permissions<Catalog>['schema'],
    };
    return permissions;
};
