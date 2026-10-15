import { groupRoutes } from './routes.js';
import { ROUTES_GROUP, type AuthoredRoutes, type Routes } from './types.js';
import type { PathParamsCheck } from './path-params.js';
import type { AuthCheck } from './auth-check.js';

/**
 * Routes from `k.routes`, carrying their group's path, `''` for none.
 */
export type DeclaredRoutes<T, Path extends string> = T & {
    readonly [ROUTES_GROUP]?: Path;
};

/**
 * Declare a tree of routes into one group.
 */
type DeclareRoutes<Path extends string, GroupPaths extends string, Names extends string, Identities> = <
    const T extends AuthoredRoutes<GroupPaths, Names>,
>(
    routes: T & PathParamsCheck<T> & AuthCheck<T, Identities>
) => DeclaredRoutes<T, Path>;

/**
 * The groups nested under one.
 */
type NestedOf<Options> = Options extends { groups: infer Nested } ? Nested : {};

/**
 * A group on `k.routes`: callable, and indexable by its nested groups.
 */
export type GroupAccessor<Options, Path extends string, GroupPaths extends string, Names extends string, Identities> = DeclareRoutes<
    Path,
    GroupPaths,
    Names,
    Identities
> & {
    readonly [Key in Extract<keyof NestedOf<Options>, string>]: GroupAccessor<
        NestedOf<Options>[Key],
        `${Path}.${Key}`,
        GroupPaths,
        Names,
        Identities
    >;
};

/**
 * `k.routes`: callable for routes in no group, and indexable by group.
 */
export type GroupRoutes<Declared, GroupPaths extends string, Names extends string, Identities> = DeclareRoutes<
    '',
    GroupPaths,
    Names,
    Identities
> & {
    readonly [Key in Extract<keyof Declared, string>]: GroupAccessor<Declared[Key], Key, GroupPaths, Names, Identities>;
};

/**
 * A tree, nested at its group's path.
 */
type NestAt<Path extends string, T> = Path extends ''
    ? T
    : Path extends `${infer Head}.${infer Rest}`
      ? {
            [Key in Head]: NestAt<Rest, T>;
        }
      : {
            [Key in Path]: T;
        };

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (value: infer Intersection) => void
    ? Intersection
    : never;

type GroupOf<T> = T extends { readonly [ROUTES_GROUP]?: infer Path extends string } ? (string extends Path ? '' : Path) : '';

/**
 * The route tree `defineConfig` builds from its list.
 */
export type AssembledRoutes<List extends readonly unknown[]> = [List[number]] extends [never]
    ? Record<string, never>
    : UnionToIntersection<
            {
                [Index in keyof List]: NestAt<GroupOf<List[Index]>, Omit<List[Index], typeof ROUTES_GROUP>>;
            }[number]
        > extends infer Tree extends Routes
      ? Tree
      : Routes;

/**
 * The runtime half of {@link GroupRoutes}. `k` never sees the groups, so
 * `defineConfig` checks each path.
 */
export const createGroupRoutes = (): unknown => {
    const accessors = new Map<string, unknown>();
    const accessorAt = (path: string): unknown => {
        const cached = accessors.get(path);
        if (cached !== undefined) return cached;
        const accessor = new Proxy(() => {}, {
            apply: (_target, _this, [routes]: [Routes]) => groupRoutes(path, routes),
            get: (_target, key) => (typeof key === 'string' ? accessorAt(path === '' ? key : `${path}.${key}`) : undefined),
        });
        accessors.set(path, accessor);
        return accessor;
    };
    return accessorAt('');
};
