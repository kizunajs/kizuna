import type { RolesOf } from './identity.js';
import type { CatalogOf, RoleNamesOf } from './permissions.js';
import type { RouteDefinition, Routes } from './types.js';

/**
 * The role names an identity accepts, or `never` when it declares none.
 */
type AcceptedRolesOf<Identities, Name extends string> = Name extends keyof Identities
    ? [RoleNamesOf<RolesOf<Identities[Name]>>] extends [never]
        ? never
        : RoleNamesOf<RolesOf<Identities[Name]>>
    : never;

/**
 * The identity names one `auth` value requires.
 */
type NamesIn<Value> = Value extends string
    ? Value
    : Value extends readonly (infer Name extends string)[]
      ? Name
      : Value extends { identity: infer Identity }
        ? Identity extends string
            ? Identity
            : Identity extends readonly (infer Name extends string)[]
              ? Name
              : never
        : never;

type RoleMismatch<Value, Identities> = Value extends { roles: infer Declared }
    ? Exclude<Declared extends readonly (infer Role)[] ? Role : Declared, AcceptedRolesOf<Identities, NamesIn<Value>>> & string
    : never;

/**
 * The verbs every identity on the route declares for one resource.
 */
type VerbsFor<Identities, Names extends string, Resource extends string> =
    CatalogsOf<Identities, Names> extends infer Catalog
        ? Catalog extends Record<string, readonly string[]>
            ? Resource extends keyof Catalog
                ? Catalog[Resource][number]
                : never
            : never
        : never;

type CatalogsOf<Identities, Names extends string> = Names extends keyof Identities ? CatalogOf<RolesOf<Identities[Names]>> : never;

type RequiresMismatch<Value, Identities> = Value extends { requires: infer Declared }
    ? {
          [Resource in keyof Declared & string]: Declared[Resource] extends readonly (infer Verb extends string)[]
              ? Verb extends VerbsFor<Identities, NamesIn<Value>, Resource>
                  ? never
                  : `${Resource}:${Verb}`
              : never;
      }[keyof Declared & string]
    : never;

/**
 * What is wrong with one route's `auth`, as a message, or `never` when it is
 * sound.
 */
type AuthMismatch<Route, Identities> = Route extends { auth: infer Value }
    ? [RoleMismatch<Value, Identities>] extends [never]
        ? [RequiresMismatch<Value, Identities>] extends [never]
            ? never
            : `kizuna: auth requires "${RequiresMismatch<Value, Identities>}", which no identity on the route declares`
        : `kizuna: auth accepts the role "${RoleMismatch<Value, Identities>}", which no identity on the route declares`
    : 'kizuna: this route needs an `auth`. Name the identity it requires, or `false` for a public route';

type TreeAuthMismatch<Node, Identities> = Node extends RouteDefinition
    ? AuthMismatch<Node, Identities>
    : Node extends object
      ? string extends keyof Node
          ? never
          : { [Key in keyof Node]: TreeAuthMismatch<Node[Key], Identities> }[keyof Node]
      : never;

type AuthMismatchShape<Node, Identities> = {
    [Key in keyof Node]: Node[Key] extends RouteDefinition
        ? [AuthMismatch<Node[Key], Identities>] extends [never]
            ? unknown
            : {
                  auth: AuthMismatch<Node[Key], Identities>;
              }
        : Node[Key] extends Routes
          ? AuthMismatchShape<Node[Key], Identities>
          : unknown;
};

/**
 * Reports routes whose `auth` is missing, or names a role or permission its
 * identities do not declare. Intersect it with the inferred route tree
 * (`defs: T & AuthCheck<T, Identities>`): a sound tree gives `unknown`, leaving
 * `T` untouched, and anything else resolves the offending `auth` to a message.
 *
 * An instance with no identities has nothing to state, so the check is off.
 */
export type AuthCheck<Tree, Identities> = [Identities] extends [Record<string, never>]
    ? unknown
    : [TreeAuthMismatch<Tree, Identities>] extends [never]
      ? unknown
      : AuthMismatchShape<Tree, Identities>;

/**
 * The {@link AuthCheck} of one route, for `k.route`.
 */
export type RouteAuthCheck<Route, Identities> = [Identities] extends [Record<string, never>]
    ? unknown
    : [AuthMismatch<Route, Identities>] extends [never]
      ? unknown
      : {
            auth: AuthMismatch<Route, Identities>;
        };
